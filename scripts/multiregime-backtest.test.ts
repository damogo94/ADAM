/**
 * A.D.A.M. — Generador y validador de backtest MULTI-RÉGIMEN (herramienta de investigación).
 *
 * QUÉ HACE. Reconstruye, de forma determinista y sin look-ahead, qué habría
 * planeado A3 en cada punto histórico de un universo diverso (~10 años,
 * bull/bear/lateral) y mide el resultado forward REAL con `evaluateTrade`.
 * Es la infraestructura de VALIDACIÓN que exige ADR-004/005 para poder (algún
 * día) presentar una señal como operable, sin p-hacking.
 *
 * VERSIÓN 2 (ADR-0006, 2026-09-11) — extiende la v1 de ADR-004:
 *   - Rama SELL con `A3_LONG_TREND_FOLLOW=OFF` (compute idéntico a prod) además
 *     de la rama BUY con el stub experimental (flag ON), que se conserva.
 *   - Corrige la truncación de ventana de la v1: un plan solo se evalúa si la
 *     serie cubre la ventana COMPLETA de su horizonte (WIN[h] días de calendario
 *     por delante); antes `H2=63 < WIN.posicional=120` y trade-eval:113 cerraba
 *     el timeout al último close → planes con ventana incompleta contaban como
 *     resueltos. Los censurados se cuentan y NO se evalúan.
 *   - Post-filtros F1/F2/F3 (`scripts/lib/gates.ts`) sobre la salida de compute:
 *     NUNCA se cablean en agents/ (plan §8). Umbrales pre-registrados con hash.
 *   - Métricas ADR-0006: R por plan emitido (no_fill=0R) y rellenado, gross y
 *     neto @10/40 y @20/80, exceso vs buy&hold(-corto) del nombre y vs SPY,
 *     N efectivo (clusters ticker×trimestre), IC bootstrap por bloque, test
 *     primario único + exploratorios con Holm, decisión mecánica por gate.
 *   - Salida versionada: scripts/out/multiregime-<registered_at>.json + .md.
 *   - SANITY previo obligatorio: reproduce la rama buy legacy de ADR-004
 *     (+0.077R gross / +0.031R neto@10/40, ±0.01) ANTES de leer cifras sell.
 *
 * CÓMO CORRERLO (NO corre en CI — gated). Hace red (Yahoo, sin claves):
 *     RUN_BACKTEST=1 corepack pnpm exec vitest run --config vitest.harness.config.ts scripts/multiregime-backtest.test.ts
 *   Solo el sanity (no escribe JSON):  BACKTEST_MODE=sanity RUN_BACKTEST=1 ...
 *   Duración orientativa: ~3-8 min (70 tickers × 2 pasadas de compute + bootstrap).
 *
 * GUARDAS METODOLÓGICOS (no romper): sin look-ahead (features solo velas ≤ i,
 * outcome en velas > i); umbrales PRE-REGISTRADOS (ADR-0006, hash verificado en
 * runtime); reportar el sesgo de supervivencia (sin CRSP faltan los deslistados
 * a cero → el corto sigue siendo OPTIMISTA); N efectivo ≪ N por solape de
 * ventanas (STEP<WIN) y correlación cross-sectional; la muestra live may-ago
 * 2026 está VETADA como test. NO ajustar umbrales mirando resultados.
 */
import { expect, test, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { evaluateTrade, type EvalCandle, type TradeOutcome, type TradePlan } from '@/lib/backtest/trade-eval';
import { classOf, type AssetClass } from '@/agents/a3/profiles';
import {
  ADR_0006_THRESHOLDS_SHA256,
  GATE_THRESHOLDS,
  anyVeto,
  applyGates,
  thresholdsHash,
  type GateTags,
  type Horizonte,
} from './lib/gates';
import {
  blockBootstrap,
  groupBy,
  holm,
  mean,
  median,
  pOneSided,
  percentileCI,
  quarterCluster,
  round,
} from './lib/stats';

// ── Constantes (todas del bloque pre-registrado) ────────────────────────────
const T = GATE_THRESHOLDS;
const LOOKBACK = T.harness.lookback;
const STEP = T.harness.step;
const LEGACY_H2 = T.harness.legacy_h2;
const MIN_CANDLES = T.harness.min_candles;
const DAY = 86_400_000;
const WIN: Record<Horizonte, number> = T.F3.window_days;
const COSTS = T.costs_bps_roundtrip;
const B = T.primary.ci.B;
const SEED = T.primary.ci.seed;
const WINNERS: string[] = [...T.universe.winners];
const CRASHED: string[] = [...T.universe.crashed];
const COLLAPSED: string[] = [...T.universe.collapsed];
const isCrypto = (tk: string) => tk.endsWith('-USD');
const OUT_TAG = T.registered_at;

type K = { t: number; o: number; h: number; l: number; c: number; v: number };
type Signal = 'buy' | 'sell';
type Branch = 'buy_legacy' | 'buy_stub' | 'sell_prod' | 'buy_prod';
type Regime = 'bull' | 'bear' | 'lateral';
type Universe = 'winners' | 'crashed' | 'collapsed';
type ComputeFn = typeof import('@/agents/a3/compute').computeTechnical;

interface Trade {
  branch: Branch;
  ticker: string;
  universe: Universe;
  cls: AssetClass;
  crypto: boolean;
  signal: Signal;
  regime: Regime;
  horizonte: Horizonte;
  entry_type: 'market' | 'limit';
  t_ms: number;
  cluster: string;
  outcome: TradeOutcome;
  /** null si no_fill / not_evaluable. */
  r: number | null;
  return_pct: number | null;
  entrada: number;
  risk: number;
  tags: GateTags;
  /** Buy&hold del propio nombre en la ventana (%), y de SPY en las mismas fechas. */
  bh_own_pct: number | null;
  bh_spy_pct: number | null;
}

// ── Gate CI: no corre sin RUN_BACKTEST (red + tarda) ────────────────────────
test.skipIf(!process.env.RUN_BACKTEST)('multi-regime backtest v2 · ADR-0006 (RUN_BACKTEST=1)', async () => {
  const mode = process.env.BACKTEST_MODE === 'sanity' ? 'sanity' : 'full';
  const runAt = new Date();
  const hash = thresholdsHash();
  const hashOk = hash === ADR_0006_THRESHOLDS_SHA256;
  console.log(`\nADR-0006 · umbrales sha256=${hash} · coincide con ADR: ${hashOk}`);
  expect(hashOk).toBe(true); // el harness se niega a correr con umbrales que no sean los pre-registrados

  // ── Datos: una descarga 'max' por ticker; de ahí salen la ventana 10y actual y la de sanity ──
  const universe = [...WINNERS, ...CRASHED, ...COLLAPSED];
  const full = await fetchAll(universe);
  const runEndMs = runAt.getTime();
  const tenYearsMs = 10 * 365.25 * DAY;
  const series10y = new Map<string, K[]>();
  for (const [tk, cs] of full) series10y.set(tk, cs.filter((k) => k.t * 1000 >= runEndMs - tenYearsMs));

  // Sanity: ventana [2016-07-12, 2026-07-12] = lo que devolvía '10y' en la corrida de ADR-004.
  const sanEnd = Date.UTC(2026, 6, 12) + DAY - 1;
  const sanStart = Date.UTC(2016, 6, 12);
  const seriesSan = new Map<string, K[]>();
  for (const [tk, cs] of full) seriesSan.set(tk, cs.filter((k) => k.t * 1000 >= sanStart && k.t * 1000 <= sanEnd));

  // Verificación mecánica de los techos colapsados (regla pre-registrada).
  const collapsedCheck = COLLAPSED.map((tk) => ({ ticker: tk, ...verifyCollapsed(full.get(tk) ?? []) }));
  const collapsedOk = new Set(collapsedCheck.filter((c) => c.ok).map((c) => c.ticker));
  const universeOf = (tk: string): Universe => (WINNERS.includes(tk) ? 'winners' : CRASHED.includes(tk) ? 'crashed' : 'collapsed');
  const usable = universe.filter((tk) => (series10y.get(tk) ?? []).length >= MIN_CANDLES && (universeOf(tk) !== 'collapsed' || collapsedOk.has(tk)));
  const spyFull = full.get('SPY') ?? [];
  console.log(`Tickers usables (10y): ${usable.length}/${universe.length} · colapsados verificados ${collapsedOk.size}/${COLLAPSED.length}`);
  for (const c of collapsedCheck.filter((x) => !x.ok)) console.log(`  · excluido ${c.ticker}: ${c.reason}`);

  // ── SANITY (rama buy legacy, stub ON, universo ADR-004, offsets de rejilla 0/1) ──
  const computeOn = await loadCompute(true);
  const legacyUniverse = [...WINNERS, ...CRASHED];
  const sanity = T.sanity_buy_legacy.grid_offsets_tried.map((offset) => {
    const series = new Map<string, K[]>();
    for (const tk of legacyUniverse) series.set(tk, (seriesSan.get(tk) ?? []).slice(offset));
    const trades = runBranch({ compute: computeOn, series, tickers: legacyUniverse.filter((tk) => (series.get(tk) ?? []).length >= MIN_CANDLES), want: ['buy'], mode: 'legacy', branch: 'buy_legacy', spy: spyFull, universeOf });
    const f = filled(trades);
    const gross = mean(f.map((t) => t.r!));
    const net = mean(f.map((t) => netR(t, 'central')));
    const pass = Math.abs(gross - T.sanity_buy_legacy.gross) <= T.sanity_buy_legacy.tol && Math.abs(net - T.sanity_buy_legacy.net_10_40) <= T.sanity_buy_legacy.tol;
    return { offset, N: f.length, gross: round(gross), net_10_40: round(net), pass };
  });
  const sanityPass = sanity.some((s) => s.pass);
  console.log('\n=== SANITY · rama BUY legacy (stub ON, H2=63 truncado, ventana 2016-07-12→2026-07-12) ===');
  console.log(`  objetivo: gross ${T.sanity_buy_legacy.gross}R · net@10/40 ${T.sanity_buy_legacy.net_10_40}R · tol ±${T.sanity_buy_legacy.tol}`);
  console.table(sanity);
  console.log(`  SANITY ${sanityPass ? 'PASS' : 'FAIL'} — ${sanityPass ? 'se pueden leer cifras sell' : 'las cifras sell NO pueden citarse como validación (ver ADR-0006)'}`);
  if (mode === 'sanity') return;

  // ── Pasada BUY stub (flag ON, bucle corregido) — exploratorio F1' ──
  const usable10y = usable.filter((tk) => (series10y.get(tk) ?? []).length >= MIN_CANDLES);
  const buyStub = runBranch({ compute: computeOn, series: series10y, tickers: usable10y, want: ['buy'], mode: 'corrected', branch: 'buy_stub', spy: spyFull, universeOf });

  // ── Pasada PROD (flag OFF → compute idéntico a producción): sell + buy por retroceso ──
  const computeOff = await loadCompute(false);
  const prod = runBranch({ compute: computeOff, series: series10y, tickers: usable10y, want: ['sell', 'buy'], mode: 'corrected', branch: 'sell_prod', spy: spyFull, universeOf });
  const sell = prod.filter((t) => t.signal === 'sell');
  const buyProd = prod.filter((t) => t.signal === 'buy').map((t) => ({ ...t, branch: 'buy_prod' as Branch }));

  // ── Conjuntos con gate (rama sell, universo des-sesgado) ──
  const notVetoed = (t: Trade, ...fs: (boolean | null)[]) => !anyVeto(...fs);
  const G = {
    ungated: sell,
    F1: sell.filter((t) => notVetoed(t, t.tags.f1)),
    F3: sell.filter((t) => notVetoed(t, t.tags.f3)),
    'F1∪F3': sell.filter((t) => notVetoed(t, t.tags.f1, t.tags.f3)),
    'F2@1.5': sell.filter((t) => notVetoed(t, t.tags.f2['1.5'] ?? null)),
    'F2@2': sell.filter((t) => notVetoed(t, t.tags.f2['2'] ?? null)),
    'F2@3': sell.filter((t) => notVetoed(t, t.tags.f2['3'] ?? null)),
    'F1∪F2∪F3': sell.filter((t) => notVetoed(t, t.tags.f1, t.tags.f2[String(T.F2.limit_max_dist_atr)] ?? null, t.tags.f3)),
    no_shorts_index_etf_commodity: sell.filter((t) => t.cls !== 'index_etf' && t.cls !== 'commodity'),
  } as const;

  // ── PRIMARIO ──
  const primarySet = G['F1∪F3'];
  const primBoot = bootMean(filled(primarySet), (t) => netR(t, 'stress'));
  const primCI = percentileCI(primBoot, T.primary.ci.level);
  const primary = {
    gate: T.primary.gate,
    metric: T.primary.metric,
    N: primarySet.length,
    N_filled: filled(primarySet).length,
    n_eff: nEff(filled(primarySet)),
    mean_net_20_80: round(mean(filled(primarySet).map((t) => netR(t, 'stress')))),
    ci95: { lo: round(primCI.lo), hi: round(primCI.hi) },
    p_one_sided: round(pOneSided(primBoot), 4),
    pass: primCI.lo > 0,
  };

  // ── CONSERVACIÓN ──
  const regimes: Regime[] = ['bull', 'bear', 'lateral'];
  const regimeDelta = regimes.map((rg) => {
    const g = filled(primarySet).filter((t) => t.regime === rg), u = filled(sell).filter((t) => t.regime === rg);
    const delta = mean(g.map((t) => netR(t, 'stress'))) - mean(u.map((t) => netR(t, 'stress')));
    return { regime: rg, N_gated: g.length, N_ungated: u.length, mean_gated: round(mean(g.map((t) => netR(t, 'stress')))), mean_ungated: round(mean(u.map((t) => netR(t, 'stress')))), delta: round(delta), ok: Number.isFinite(delta) && delta >= T.conservation.regime_delta_min_r };
  });
  const cmpNoIdx = mean(filled(G.no_shorts_index_etf_commodity).map((t) => netR(t, 'stress')));
  const vetoed = sell.filter((t) => anyVeto(t.tags.f1, t.tags.f3));
  const conservation = {
    regime_delta_min_r: T.conservation.regime_delta_min_r,
    regimes: regimeDelta,
    beats_no_shorts: primary.mean_net_20_80 > 0,
    no_shorts_index_etf_commodity: { N_filled: filled(G.no_shorts_index_etf_commodity).length, mean_net_20_80: round(cmpNoIdx) },
    beats_no_shorts_index_etf_commodity: primary.mean_net_20_80 > cmpNoIdx,
    vetoed_winners: { N: vetoed.filter((t) => t.outcome === 'win').length, sum_r: round(vetoed.filter((t) => t.outcome === 'win').reduce((s, t) => s + (t.r ?? 0), 0)) },
    vetoed_losers: { N: vetoed.filter((t) => t.outcome === 'loss').length, sum_r: round(vetoed.filter((t) => t.outcome === 'loss').reduce((s, t) => s + (t.r ?? 0), 0)) },
    vetoed_total: vetoed.length,
  };
  const conservationOk = regimeDelta.every((r) => r.ok) && conservation.beats_no_shorts && conservation.beats_no_shorts_index_etf_commodity;
  const decision = {
    'F1∪F3': primary.pass && conservationOk ? 'candidato_paper_trading' : 'descartado',
    reasons: [
      `primario ${primary.pass ? 'PASA' : 'FALLA'} (IC95 lo=${primary.ci95.lo})`,
      ...regimeDelta.map((r) => `régimen ${r.regime}: Δ=${r.delta} ${r.ok ? 'ok' : 'FALLA'}`),
      `supera 'ningún corto': ${conservation.beats_no_shorts}`,
      `supera 'ningún corto en index_etf/commodity' (${round(cmpNoIdx)}R): ${conservation.beats_no_shorts_index_etf_commodity}`,
      `sanity buy legacy: ${sanityPass ? 'PASS' : 'FAIL'}`,
    ],
    nota: 'aprobar ≠ tradeable: después, paper-trading forward (ADR-005). Cota superior: sin CRSP faltan deslistados a cero.',
  };

  // ── EXPLORATORIO (Holm) ──
  const stressNet = (t: Trade) => netR(t, 'stress');
  const emittedNet = (t: Trade) => (t.r == null ? 0 : netR(t, 'stress'));
  const buyMirror = buyStub.filter((t) => notVetoed(t, t.tags.f1));
  const explor = [
    exploreMean('F1', G.F1, stressNet),
    exploreMean('F3', G.F3, stressNet),
    exploreDelta('F1_mirror_buy', buyMirror, buyStub, stressNet, 'Δ mean net@20/80 rellenado (buy stub retenido − sin gate)'),
    exploreDelta('F2@1.5', G['F2@1.5'], sell, emittedNet, 'Δ mean net@20/80 por plan EMITIDO (no_fill=0R)'),
    exploreDelta('F2@2', G['F2@2'], sell, emittedNet, 'Δ mean net@20/80 por plan EMITIDO (no_fill=0R)'),
    exploreDelta('F2@3', G['F2@3'], sell, emittedNet, 'Δ mean net@20/80 por plan EMITIDO (no_fill=0R)'),
    exploreMean('F1∪F2∪F3', G['F1∪F2∪F3'], stressNet),
    exploreDelta('delta gated - ungated (F1∪F3)', G['F1∪F3'], sell, stressNet, 'Δ mean net@20/80 rellenado (doble-null vs etiqueta cruda)'),
  ];
  const holmRes = holm(explor.map((e) => ({ name: e.name, p: e.p })), T.exploratory.alpha);
  const exploratory = explor.map((e, i) => ({ ...e, p_adj_holm: round(holmRes[i]!.p_adj, 4), reject_holm: holmRes[i]!.reject }));

  // ── Desgloses descriptivos ──
  const byKey = <Tk extends string>(sel: Trade[], key: (t: Trade) => Tk) =>
    [...groupBy(sel, key).entries()].map(([k, v]) => ({ key: k, ...summarize(v) })).sort((a, b) => a.key.localeCompare(b.key));
  const breakdowns = {
    sell_by_universe: byKey(sell, (t) => t.universe),
    sell_gated_by_universe: byKey(primarySet, (t) => t.universe),
    sell_by_regime: byKey(sell, (t) => t.regime),
    sell_gated_by_regime: byKey(primarySet, (t) => t.regime),
    sell_by_class: byKey(sell, (t) => t.cls),
    sell_gated_by_class: byKey(primarySet, (t) => t.cls),
    sell_by_horizonte: byKey(sell, (t) => t.horizonte),
    sell_by_entry_type: byKey(sell, (t) => t.entry_type),
    sell_f1_indeterminado: sell.filter((t) => t.tags.f1 === null).length,
    sell_f3_indeterminado: sell.filter((t) => t.tags.f3 === null).length,
    sell_f2_fill_rate: Object.fromEntries((['F2@1.5', 'F2@2', 'F2@3'] as const).map((k) => [k, { N: G[k].length, fill_rate: round(fillRate(G[k])) }])),
    sell_ungated_fill_rate: round(fillRate(sell)),
    buy_stub_by_regime: byKey(buyStub, (t) => t.regime),
    buy_stub_mirror_by_regime: byKey(buyMirror, (t) => t.regime),
  };

  const branches = {
    sell_prod: summarizeWithCI(sell),
    'sell_prod:F1∪F3': summarizeWithCI(primarySet),
    'sell_prod:F1': summarizeWithCI(G.F1),
    'sell_prod:F3': summarizeWithCI(G.F3),
    'sell_prod:F1∪F2∪F3': summarizeWithCI(G['F1∪F2∪F3']),
    'sell_prod:no_shorts_index_etf_commodity': summarizeWithCI(G.no_shorts_index_etf_commodity),
    buy_prod: summarizeWithCI(buyProd),
    buy_stub: summarizeWithCI(buyStub),
    'buy_stub:F1_mirror': summarizeWithCI(buyMirror),
    'buy_stub:winners+crashed': summarizeWithCI(buyStub.filter((t) => t.universe !== 'collapsed')),
  };

  // ── Consola ──
  console.log('\n=== RAMAS (R/plan) · gross + neto · por plan RELLENADO y EMITIDO ===');
  console.table(Object.entries(branches).map(([k, v]) => ({ set: k, N: v.N, filled: v.N_filled, n_eff: v.n_eff, gross: v.gross_filled, 'net@10/40': v.net_10_40_filled, 'net@20/80': v.net_20_80_filled, 'emit net@20/80': v.net_20_80_emitted, ci_lo: v.ci95_net_20_80.lo, ci_hi: v.ci95_net_20_80.hi, fill: v.fill_rate })));
  console.log('\n=== PRIMARIO (pre-registrado) ==='); console.table([primary]);
  console.log('\n=== CONSERVACIÓN ==='); console.table(regimeDelta); console.log(conservation);
  console.log('\n=== EXPLORATORIO (Holm) ==='); console.table(exploratory.map((e) => ({ test: e.name, N: e.N, stat: e.stat, ci_lo: e.ci95.lo, ci_hi: e.ci95.hi, p: e.p, p_holm: e.p_adj_holm, reject: e.reject_holm })));
  console.log('\n=== DECISIÓN ==='); console.log(decision);

  // ── Salida versionada ──
  const out = {
    schema: 'adam.multiregime.v2',
    adr: '0006',
    run_at: runAt.toISOString(),
    seed: SEED,
    B,
    thresholds_sha256: hash,
    hash_matches_adr: hashOk,
    thresholds: T,
    data: {
      source: 'Yahoo /v8/chart period1=2016-01-01&period2=now&interval=1d → ventana 10y (run_at − 10·365.25d) para el test; [2016-07-12, 2026-07-12] para el sanity',
      tickers: { winners: WINNERS, crashed: CRASHED, collapsed_candidates: COLLAPSED, collapsed_verified: [...collapsedOk], collapsed_rejected: collapsedCheck.filter((c) => !c.ok), usable: usable10y, unusable: universe.filter((tk) => !usable10y.includes(tk)) },
      candles_10y: Object.fromEntries(usable10y.map((tk) => [tk, series10y.get(tk)!.length])),
      classes: Object.fromEntries(usable10y.map((tk) => [tk, classOf(tk)])),
      censored_incomplete_window: { sell_prod_and_buy_prod: censoredCount.get('sell_prod') ?? 0, buy_stub: censoredCount.get('buy_stub') ?? 0 },
    },
    sanity: { target: T.sanity_buy_legacy, offsets: sanity, pass: sanityPass },
    branches,
    primary,
    conservation,
    exploratory,
    decision,
    breakdowns,
  };
  mkdirSync('scripts/out', { recursive: true });
  writeFileSync(`scripts/out/multiregime-${OUT_TAG}.json`, JSON.stringify(out, null, 2) + '\n');
  writeFileSync(`scripts/out/multiregime-${OUT_TAG}.md`, renderMarkdown(out));
  console.log(`\nEscrito scripts/out/multiregime-${OUT_TAG}.{json,md}`);
}, 3_600_000);

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const censoredCount = new Map<Branch, number>();

async function loadCompute(longTrendFollow: boolean): Promise<ComputeFn> {
  vi.stubEnv('A3_LONG_TREND_FOLLOW', longTrendFollow ? 'true' : 'false');
  vi.resetModules();
  const m = await import('@/agents/a3/compute');
  return m.computeTechnical;
}

/**
 * Descarga diaria por ticker desde 2016-01-01 (cubre la ventana 10y del test, la
 * ventana del sanity 2016-07-12→2026-07-12 y la regla COLLAPSED 2016-2024).
 *
 * Por qué NO usa `fallbackDaily` (el path de datos de prod, que sí usaba la v1):
 *   1. `range=max` en Yahoo DEGRADA silenciosamente el intervalo a mensual (SPY →
 *      405 velas desde 1993) y `range=10y` no puede reproducir la ventana exacta
 *      de la corrida de ADR-004 → hace falta `period1/period2&interval=1d`, que
 *      `fallbackDaily(symbol, range)` no expone.
 *   2. El normalizador de la app convierte `XXX-USD` de 3 letras no catalogadas
 *      (ICP/FIL/AXS/EOS…) en forex `XXXUSD=X` → Yahoo devuelve error.
 * Misma URL base, mismo User-Agent y mismo parse que `yahooChart` de la app.
 * Un reintento por ticker; timeout 10s (las series de 10 años pesan ~300 KB).
 */
async function fetchAll(tickers: string[], concurrency = 4): Promise<Map<string, K[]>> {
  const out = new Map<string, K[]>();
  const period1 = Math.floor(Date.UTC(2016, 0, 1) / 1000);
  const period2 = Math.floor(Date.now() / 1000) + 86_400;
  let idx = 0;
  const worker = async () => {
    while (idx < tickers.length) {
      const tk = tickers[idx++]!;
      let raw: K[] = [];
      for (let attempt = 0; attempt < 2 && raw.length === 0; attempt++) {
        try {
          raw = await yahooRawDaily(tk, period1, period2);
        } catch {
          raw = [];
        }
      }
      const seen = new Set<number>();
      out.set(tk, raw.filter((k) => Number.isFinite(k.c) && k.c > 0 && !seen.has(k.t) && seen.add(k.t)).sort((a, b) => a.t - b.t));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

async function yahooRawDaily(symbol: string, period1: number, period2: number): Promise<K[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ADAM/1.0)' } });
  if (!res.ok) return [];
  const data = (await res.json()) as { chart: { error?: unknown; result?: { timestamp: number[]; indicators: { quote?: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] } }[] } };
  const r = data.chart.result?.[0];
  const q = r?.indicators.quote?.[0];
  if (data.chart.error || !r || !q) return [];
  const cs: K[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    cs.push({ t: r.timestamp[i]!, o, h, l, c, v: q.volume[i] ?? 0 });
  }
  return cs;
}

/** Regla mecánica COLLAPSED (ADR-0006): drawdown close-a-close ≥ 80% con pico y valle en 2016-01-01..2024-12-31. */
function verifyCollapsed(cs: K[]): { ok: boolean; reason: string; drawdown: number | null; peak_date: string | null; trough_date: string | null } {
  const lo = Date.UTC(2016, 0, 1) / 1000, hi = Date.UTC(2024, 11, 31, 23, 59, 59) / 1000;
  const w = cs.filter((k) => k.t >= lo && k.t <= hi);
  if (cs.length < MIN_CANDLES) return { ok: false, reason: `sin datos suficientes (${cs.length} velas)`, drawdown: null, peak_date: null, trough_date: null };
  let peak = -Infinity, peakT = 0, maxDD = 0, ddT = 0, ddPeakT = 0;
  for (const k of w) {
    if (k.c > peak) { peak = k.c; peakT = k.t; }
    const dd = 1 - k.c / peak;
    if (dd > maxDD) { maxDD = dd; ddT = k.t; ddPeakT = peakT; }
  }
  const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
  const ok = maxDD >= T.universe.collapsed_rule.drawdown_min;
  return { ok, reason: ok ? 'ok' : `drawdown ${(maxDD * 100).toFixed(1)}% < 80%`, drawdown: round(maxDD), peak_date: ddPeakT ? iso(ddPeakT) : null, trough_date: ddT ? iso(ddT) : null };
}

function runBranch(opts: {
  compute: ComputeFn;
  series: Map<string, K[]>;
  tickers: string[];
  want: Signal[];
  mode: 'legacy' | 'corrected';
  branch: Branch;
  spy: K[];
  universeOf: (tk: string) => Universe;
}): Trade[] {
  const { compute, series, tickers, want, mode, branch, spy, universeOf } = opts;
  const trades: Trade[] = [];
  let censored = 0;
  for (const tk of tickers) {
    const cs = series.get(tk) ?? [];
    const cls = classOf(tk);
    const end = mode === 'legacy' ? cs.length - LEGACY_H2 - 1 : cs.length;
    for (let i = LOOKBACK; i < end; i += STEP) {
      const out = compute({ ticker: tk, ohlcv: cs.slice(i + 1 - LOOKBACK, i + 1), timeframe: '1D' });
      const op = out.operativa;
      if (op.signal === 'hold' || !want.includes(op.signal) || op.entrada == null || op.stop_loss == null || op.target == null) continue;
      const signal: Signal = op.signal;
      const startMs = cs[i]!.t * 1000;
      const winDays = WIN[op.horizonte] ?? 30;
      const endMs = startMs + winDays * DAY;
      // Corrección ADR-0006: exigir ventana COMPLETA (la serie llega más allá de endMs).
      if (mode === 'corrected' && cs[cs.length - 1]!.t * 1000 < endMs) { censored++; continue; }
      const fwdK = cs.filter((k) => k.t * 1000 > startMs && k.t * 1000 <= endMs);
      if (!fwdK.length) continue;
      const fwd: EvalCandle[] = fwdK.map((k) => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c }));
      const plan: TradePlan = { direction: signal, entry_type: op.entry_type === 'limit' ? 'limit' : 'market', entrada: op.entrada, stop_loss: op.stop_loss, target: op.target };
      const ev = evaluateTrade(plan, fwd, { windowElapsed: true });
      if (ev.status !== 'resolved' || ev.outcome == null) continue;
      const price = cs[i]!.c;
      const tags = applyGates({ signal, price, sma200: out.medias.sma200, entry_type: op.entry_type ?? null, entrada: op.entrada, target: op.target, atr: op.atr_actual, horizonte: op.horizonte });
      const filledR = ev.outcome === 'no_fill' || ev.outcome === 'not_evaluable' ? null : ev.r_multiple;
      const lastFwd = fwdK[fwdK.length - 1]!;
      trades.push({
        branch, ticker: tk, universe: universeOf(tk), cls, crypto: isCrypto(tk), signal,
        regime: spyRegimeAt(startMs, spy), horizonte: op.horizonte, entry_type: plan.entry_type,
        t_ms: startMs, cluster: quarterCluster(tk, startMs), outcome: ev.outcome, r: filledR,
        return_pct: filledR == null ? null : ev.return_pct, entrada: op.entrada, risk: Math.abs(op.entrada - op.stop_loss), tags,
        bh_own_pct: ((lastFwd.c - price) / price) * 100,
        bh_spy_pct: spyReturnPct(spy, startMs, lastFwd.t * 1000),
      });
    }
  }
  censoredCount.set(branch, (censoredCount.get(branch) ?? 0) + censored);
  return trades;
}

const filled = (sel: Trade[]) => sel.filter((t) => t.r != null);
const fillRate = (sel: Trade[]) => (sel.length ? filled(sel).length / sel.length : NaN);
/** Coste round-trip en R = bps/1e4 · entrada / riesgo. */
function netR(t: Trade, level: 'central' | 'stress'): number {
  const bps = t.crypto ? COSTS[level].crypto : COSTS[level].equity;
  return (t.r ?? 0) - (bps / 1e4) * (t.entrada / t.risk);
}
const nEff = (sel: Trade[]) => new Set(sel.map((t) => t.cluster)).size;
const dirSign = (t: Trade) => (t.signal === 'buy' ? 1 : -1);

function bootMean(sel: Trade[], f: (t: Trade) => number): number[] {
  const groups = [...groupBy(sel, (t) => t.cluster).values()];
  return blockBootstrap(groups, (items) => mean(items.map(f)), B, SEED);
}

function summarize(sel: Trade[]) {
  const f = filled(sel);
  const count = (o: TradeOutcome) => sel.filter((t) => t.outcome === o).length;
  const exOwn = f.map((t) => t.return_pct! - dirSign(t) * t.bh_own_pct!);
  const exSpy = f.filter((t) => t.bh_spy_pct != null).map((t) => t.return_pct! - dirSign(t) * t.bh_spy_pct!);
  return {
    N: sel.length, N_filled: f.length, n_eff: nEff(sel), n_eff_filled: nEff(f),
    win: count('win'), loss: count('loss'), timeout: count('timeout'), no_fill: count('no_fill'), not_evaluable: count('not_evaluable'),
    fill_rate: round(fillRate(sel)),
    gross_filled: round(mean(f.map((t) => t.r!))),
    net_10_40_filled: round(mean(f.map((t) => netR(t, 'central')))),
    net_20_80_filled: round(mean(f.map((t) => netR(t, 'stress')))),
    gross_emitted: round(sel.length ? f.reduce((s, t) => s + t.r!, 0) / sel.length : NaN),
    net_20_80_emitted: round(sel.length ? f.reduce((s, t) => s + netR(t, 'stress'), 0) / sel.length : NaN),
    median_r_filled: round(median(f.map((t) => t.r!))),
    excess_vs_bh_own_pct: round(mean(exOwn), 2),
    excess_vs_bh_spy_pct: round(mean(exSpy), 2),
    tickers: new Set(sel.map((t) => t.ticker)).size,
  };
}

function summarizeWithCI(sel: Trade[]) {
  const s = summarize(sel);
  const boots = bootMean(filled(sel), (t) => netR(t, 'stress'));
  const ci = percentileCI(boots, T.primary.ci.level);
  return { ...s, ci95_net_20_80: { lo: round(ci.lo), hi: round(ci.hi) } };
}

function exploreMean(name: string, sel: Trade[], f: (t: Trade) => number) {
  const boots = bootMean(filled(sel), f);
  const ci = percentileCI(boots, T.primary.ci.level);
  return { name, metric: 'mean net@20/80 rellenado > 0', N: sel.length, N_filled: filled(sel).length, n_eff: nEff(filled(sel)), stat: round(mean(filled(sel).map(f))), ci95: { lo: round(ci.lo), hi: round(ci.hi) }, p: round(pOneSided(boots), 4) };
}

/** Δ = mean(f | retenidos) − mean(f | todos), bootstrap conjunto por cluster (mismos clusters en ambos términos). */
function exploreDelta(name: string, retained: Trade[], all: Trade[], f: (t: Trade) => number, metric: string) {
  const keep = new Set(retained);
  const perEmitted = metric.includes('EMITIDO');
  const base = perEmitted ? all : filled(all);
  const groups = [...groupBy(base, (t) => t.cluster).values()];
  const stat = (items: Trade[]) => {
    const r = items.filter((t) => keep.has(t));
    return mean(r.map(f)) - mean(items.map(f));
  };
  const boots = blockBootstrap(groups, stat, B, SEED);
  const ci = percentileCI(boots, T.primary.ci.level);
  const retainedBase = perEmitted ? retained : filled(retained);
  return { name, metric, N: retained.length, N_filled: filled(retained).length, n_eff: nEff(retainedBase), stat: round(stat(base)), ci95: { lo: round(ci.lo), hi: round(ci.hi) }, p: round(pOneSided(boots), 4) };
}

/** Régimen de mercado (SPY) en una fecha: bull(close>SMA200 & subiendo)/bear/lateral. Memo sobre la serie SPY. */
let _reg: { ms: number; r: Regime }[] | null = null;
function spyRegimeAt(ms: number, spy: K[]): Regime {
  if (!_reg) {
    const c = spy.map((k) => k.c);
    const sma = (a: number[], i: number, p: number) => (i + 1 < p ? null : a.slice(i + 1 - p, i + 1).reduce((s, x) => s + x, 0) / p);
    _reg = spy.map((k, i) => { const s = sma(c, i, 200), sp = i >= 20 ? sma(c, i - 20, 200) : null; let r: Regime = 'lateral'; if (s != null && sp != null) { const up = s > sp; if (c[i]! > s && up) r = 'bull'; else if (c[i]! < s && !up) r = 'bear'; } return { ms: k.t * 1000, r }; });
  }
  let r: Regime = 'lateral';
  for (const x of _reg) { if (x.ms <= ms) r = x.r; else break; }
  return r;
}

/** Retorno % de SPY entre el último close ≤ startMs y el último close ≤ endMs (null si falta). */
function spyReturnPct(spy: K[], startMs: number, endMs: number): number | null {
  let a: number | null = null, b: number | null = null;
  for (const k of spy) { const ms = k.t * 1000; if (ms <= startMs) a = k.c; if (ms <= endMs) b = k.c; else break; }
  return a != null && b != null ? ((b - a) / a) * 100 : null;
}

function renderMarkdown(o: {
  run_at: string; thresholds_sha256: string; hash_matches_adr: boolean; sanity: { offsets: { offset: number; N: number; gross: number; net_10_40: number; pass: boolean }[]; pass: boolean };
  data: { tickers: { usable: string[]; collapsed_verified: string[]; collapsed_candidates: string[]; collapsed_rejected: { ticker: string; reason: string }[] }; censored_incomplete_window: Record<string, number> };
  branches: Record<string, ReturnType<typeof summarizeWithCI>>;
  primary: { gate: string; N: number; N_filled: number; n_eff: number; mean_net_20_80: number; ci95: { lo: number; hi: number }; p_one_sided: number; pass: boolean };
  conservation: { regimes: { regime: string; N_gated: number; N_ungated: number; mean_gated: number; mean_ungated: number; delta: number; ok: boolean }[]; beats_no_shorts: boolean; beats_no_shorts_index_etf_commodity: boolean; no_shorts_index_etf_commodity: { mean_net_20_80: number }; vetoed_winners: { N: number; sum_r: number }; vetoed_losers: { N: number; sum_r: number }; vetoed_total: number };
  exploratory: { name: string; metric: string; N: number; N_filled: number; n_eff: number; stat: number; ci95: { lo: number; hi: number }; p: number; p_adj_holm: number; reject_holm: boolean }[];
  decision: { 'F1∪F3': string; reasons: string[]; nota: string };
}): string {
  const L: string[] = [];
  L.push(`# Multi-régimen v2 · ADR-0006 · ${o.run_at.slice(0, 10)}`, '');
  L.push(`- Umbrales sha256: \`${o.thresholds_sha256}\` (coincide con ADR: ${o.hash_matches_adr})`);
  L.push(`- Tickers usables: ${o.data.tickers.usable.length} · colapsados verificados ${o.data.tickers.collapsed_verified.length}/${o.data.tickers.collapsed_candidates.length}${o.data.tickers.collapsed_rejected.length ? ` (excluidos: ${o.data.tickers.collapsed_rejected.map((c) => `${c.ticker} — ${c.reason}`).join('; ')})` : ''}`);
  L.push(`- Planes censurados por ventana incompleta (no evaluados): ${JSON.stringify(o.data.censored_incomplete_window)}`, '');
  L.push(`## Sanity · rama buy legacy (ADR-004: +0.077R gross / +0.031R neto@10/40 ±0.01) → **${o.sanity.pass ? 'PASS' : 'FAIL'}**`, '');
  L.push('| offset | N | gross | net@10/40 | pass |', '|---|---|---|---|---|');
  for (const s of o.sanity.offsets) L.push(`| ${s.offset} | ${s.N} | ${s.gross} | ${s.net_10_40} | ${s.pass} |`);
  L.push('', '## Ramas (R por plan; rellenado y emitido)', '');
  L.push('| set | N | filled | n_eff | W/L/T/NF | fill | gross | net@10/40 | net@20/80 | IC95 net@20/80 | emit net@20/80 | exc. vs BH nombre (pp) | exc. vs BH SPY (pp) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(o.branches)) L.push(`| ${k} | ${v.N} | ${v.N_filled} | ${v.n_eff_filled} | ${v.win}/${v.loss}/${v.timeout}/${v.no_fill} | ${v.fill_rate} | ${v.gross_filled} | ${v.net_10_40_filled} | ${v.net_20_80_filled} | [${v.ci95_net_20_80.lo}, ${v.ci95_net_20_80.hi}] | ${v.net_20_80_emitted} | ${v.excess_vs_bh_own_pct} | ${v.excess_vs_bh_spy_pct} |`);
  L.push('', `## Test primario · ${o.primary.gate} (sell, des-sesgado, neto@20/80 rellenado) → **${o.primary.pass ? 'PASA' : 'FALLA'}**`, '');
  L.push(`N=${o.primary.N} · rellenados=${o.primary.N_filled} · n_eff=${o.primary.n_eff} · media=${o.primary.mean_net_20_80}R · IC95=[${o.primary.ci95.lo}, ${o.primary.ci95.hi}] · p=${o.primary.p_one_sided}`, '');
  L.push('## Conservación', '', '| régimen | N gated | N ungated | mean gated | mean ungated | Δ | ok (≥ −0.05) |', '|---|---|---|---|---|---|---|');
  for (const r of o.conservation.regimes) L.push(`| ${r.regime} | ${r.N_gated} | ${r.N_ungated} | ${r.mean_gated} | ${r.mean_ungated} | ${r.delta} | ${r.ok} |`);
  L.push('', `- Supera 'ningún corto' (0R): ${o.conservation.beats_no_shorts}`);
  L.push(`- Supera 'ningún corto en index_etf/commodity' (${o.conservation.no_shorts_index_etf_commodity.mean_net_20_80}R): ${o.conservation.beats_no_shorts_index_etf_commodity}`);
  L.push(`- Vetados por F1∪F3: ${o.conservation.vetoed_total} · ganadores vetados ${o.conservation.vetoed_winners.N} (ΣR ${o.conservation.vetoed_winners.sum_r}) · perdedores vetados ${o.conservation.vetoed_losers.N} (ΣR ${o.conservation.vetoed_losers.sum_r})`, '');
  L.push('## Exploratorio (Holm, α=0.05)', '', '| test | métrica | N | filled | n_eff | stat | IC95 | p | p Holm | rechaza H0 |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const e of o.exploratory) L.push(`| ${e.name} | ${e.metric} | ${e.N} | ${e.N_filled} | ${e.n_eff} | ${e.stat} | [${e.ci95.lo}, ${e.ci95.hi}] | ${e.p} | ${e.p_adj_holm} | ${e.reject_holm} |`);
  L.push('', `## Decisión mecánica · F1∪F3 → **${o.decision['F1∪F3']}**`, '');
  for (const r of o.decision.reasons) L.push(`- ${r}`);
  L.push('', `> ${o.decision.nota}`, '');
  return L.join('\n');
}
