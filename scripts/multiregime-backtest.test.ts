/**
 * A.D.A.M. — Generador y validador de backtest MULTI-RÉGIMEN (herramienta de investigación).
 *
 * QUÉ HACE. Reconstruye, de forma determinista y sin look-ahead, qué habría
 * etiquetado/planeado A3 en cada punto histórico de un universo diverso a lo
 * largo de ~10 años (multi-régimen: bull/bear/lateral), y mide el resultado
 * forward REAL. Es la infraestructura de VALIDACIÓN que exige el ADR-004 para
 * poder (algún día) reactivar el lado largo o cualquier señal nueva, sin
 * p-hacking (umbrales pre-registrados, out-of-sample multi-régimen).
 *
 * POR QUÉ EXISTE. La muestra live de A3 era un solo régimen bajista (2026),
 * dominada por ~5 tickers, con horizonte censurado → no podía validar nada
 * largo. Esta herramienta rompe ese muro usando historia real (fallbackDaily
 * '10y') sobre un universo amplio, incluyendo nombres que se DESPLOMARON
 * (rompe el sesgo de supervivencia), con modelo de COSTES por clase.
 *
 * QUÉ MIDE (ver resultados y conclusión en docs/adr/0004):
 *   1. Doble-null: ¿la etiqueta 'alcista' timea mejor que buy&hold del propio nombre? (→ ~0, no)
 *   2. Expectativa PATH-DEPENDENT de los planes largos (computeLongTrendFollow → evaluateTrade),
 *      gross vs neto de costes, universo WINNERS vs DES-SESGADO (con crashed).
 *
 * CÓMO CORRERLO (NO corre en CI — gated). Hace red (Yahoo) y tarda ~1-2 min:
 *     RUN_BACKTEST=1 node_modules/.bin/vitest run scripts/multiregime-backtest.test.ts
 *
 * GUARDAS METODOLÓGICOS (no romper): sin look-ahead (features solo velas ≤ i,
 * outcome en velas > i); umbrales PRE-REGISTRADOS (no tunear al resultado);
 * reportar el sesgo de supervivencia (el universo CRASHED es un proxy: nombres
 * que cayeron pero SIGUEN vivos; los deslistados-a-cero necesitan una base tipo
 * CRSP, no disponible aquí → el gross des-sesgado sigue siendo OPTIMISTA);
 * N efectivo ≪ N por solape de ventanas (STEP<H) y correlación cross-sectional.
 */
import { test, vi } from 'vitest';
import { fallbackDaily } from '@/lib/market/finnhub';
import { evaluateTrade, type EvalCandle, type TradePlan } from '@/lib/backtest/trade-eval';

// Universo. WINNERS = supervivientes (sesgado). CRASHED = se desplomaron 60-90% o
// declive secular (proxy anti-survivorship). El de-sesgado es WINNERS ∪ CRASHED.
const WINNERS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'XOM', 'JPM', 'JNJ', 'WMT', 'CAT', 'TLT', 'GLD', 'USO', 'EEM', 'EFA', 'BTC-USD', 'ETH-USD'];
const CRASHED = ['META', 'NFLX', 'TSLA', 'AMD', 'INTC', 'BABA', 'DIS', 'BA', 'GE', 'F', 'BAC', 'C', 'T', 'PFE', 'OXY', 'ARKK', 'MMM', 'SOL-USD', 'ADA-USD', 'DOGE-USD', 'XRP-USD'];
const CRYPTO = new Set(['BTC-USD', 'ETH-USD', 'SOL-USD', 'ADA-USD', 'DOGE-USD', 'XRP-USD']);
const LOOKBACK = 300, STEP = 21, H2 = 63, DAY = 86_400_000;
const WIN: Record<string, number> = { intradia: 30, swing: 30, posicional: 120 };
type K = { t: number; o: number; h: number; l: number; c: number; v: number };
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

// Gated: no corre en CI (sin RUN_BACKTEST). Hace red + tarda.
test.skipIf(!process.env.RUN_BACKTEST)('multi-regime backtest (RUN_BACKTEST=1)', async () => {
  vi.stubEnv('A3_LONG_TREND_FOLLOW', 'true'); // planes largos experimentales activos SOLO en el backtest
  vi.resetModules();
  const { computeTechnical } = await import('@/agents/a3/compute');

  const universe = [...WINNERS, ...CRASHED];
  const cache = new Map<string, K[]>();
  for (const tk of universe) { try { cache.set(tk, (await fallbackDaily(tk, '10y')) as K[]); } catch { cache.set(tk, []); } }
  const usable = universe.filter((t) => (cache.get(t) || []).length >= LOOKBACK + H2 + 5);

  type Trade = { ticker: string; regime: string; r: number; entrada: number; risk: number; crypto: boolean };
  const trades: Trade[] = [];

  for (const tk of usable) {
    const cs = cache.get(tk)!;
    for (let i = LOOKBACK; i < cs.length - H2 - 1; i += STEP) {
      const out = computeTechnical({ ticker: tk, ohlcv: cs.slice(0, i + 1).slice(-LOOKBACK), timeframe: '1D' });
      const op = out.operativa;
      if (op.signal === 'buy' && op.entrada != null && op.stop_loss != null && op.target != null) {
        const plan: TradePlan = { direction: 'buy', entry_type: op.entry_type === 'limit' ? 'limit' : 'market', entrada: op.entrada, stop_loss: op.stop_loss, target: op.target };
        const startMs = cs[i]!.t * 1000, winDays = WIN[op.horizonte] ?? 30;
        const fwd: EvalCandle[] = cs.filter((k) => k.t * 1000 > startMs && k.t * 1000 <= startMs + winDays * DAY).map((k) => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c }));
        if (fwd.length) {
          const ev = evaluateTrade(plan, fwd, { windowElapsed: true });
          if (ev.status === 'resolved' && ev.outcome !== 'no_fill' && ev.outcome !== 'not_evaluable' && ev.r_multiple != null) {
            trades.push({ ticker: tk, regime: spyRegimeAt(startMs, cache), r: ev.r_multiple, entrada: op.entrada, risk: op.entrada - op.stop_loss, crypto: CRYPTO.has(tk) });
          }
        }
      }
    }
  }

  // Coste round-trip en R = bps/1e4 * entrada / risk.
  const netExp = (sel: Trade[], bpsEq: number, bpsCr: number) =>
    mean(sel.map((t) => t.r - ((t.crypto ? bpsCr : bpsEq) / 1e4) * (t.entrada / t.risk)));
  const summary = (sel: Trade[]) => ({
    N: sel.length, gross: +mean(sel.map((t) => t.r)).toFixed(3),
    'net@10/40': +netExp(sel, 10, 40).toFixed(3), 'net@20/80': +netExp(sel, 20, 80).toFixed(3),
  });
  const winT = trades.filter((t) => WINNERS.includes(t.ticker));
  console.log(`\nTickers usables: ${usable.length}/${universe.length}`);
  console.log('\n=== EXPECTATIVA planes LONG (R/trade) · survivorship (gross) + costes (neto) ===');
  console.table([
    { universo: 'WINNERS (sesgado)', ...summary(winT) },
    { universo: 'DES-SESGADO (+crashed)', ...summary(trades) },
    { universo: 'solo CRASHED', ...summary(trades.filter((t) => CRASHED.includes(t.ticker))) },
  ]);

  console.log('\n=== Expectativa por régimen (des-sesgado, gross) ===');
  for (const r of ['bull', 'bear', 'lateral']) { const s = trades.filter((t) => t.regime === r); console.log(`  ${r.padEnd(8)}: N=${s.length} · gross ${s.length ? mean(s.map((t) => t.r)).toFixed(3) : '-'}R`); }
  console.log(`\nInterpretación: gross des-sesgado ≈ mitad del sesgado (survivorship); neto@central adelgaza a ~ruido; negativo bajo estrés o sobre crashed → sin edge robusto (ADR-004).`);
}, 300_000);

/** Régimen de mercado (SPY) en una fecha: bull(close>SMA200 & subiendo)/bear/lateral. Perezoso + memo. */
let _reg: { ms: number; r: string }[] | null = null;
function spyRegimeAt(ms: number, cache: Map<string, K[]>): string {
  if (!_reg) {
    const spy = cache.get('SPY') || [], c = spy.map((k) => k.c);
    const sma = (a: number[], i: number, p: number) => (i + 1 < p ? null : a.slice(i + 1 - p, i + 1).reduce((s, x) => s + x, 0) / p);
    _reg = spy.map((k, i) => { const s = sma(c, i, 200), sp = i >= 20 ? sma(c, i - 20, 200) : null; let r = 'lateral'; if (s != null && sp != null) { const up = s > sp; if (c[i]! > s && up) r = 'bull'; else if (c[i]! < s && !up) r = 'bear'; } return { ms: k.t * 1000, r }; });
  }
  let r = 'lateral';
  for (const x of _reg) { if (x.ms <= ms) r = x.r; else break; }
  return r;
}
