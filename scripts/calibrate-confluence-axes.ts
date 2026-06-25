/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * Harness de calibración de K_FLOOR / G_MIN (Fase 1 · ejes separados).
 *
 * Offline, read-only. Recomputa net/κ/actionable sobre los análisis históricos
 * (reusando computeConfluence + scoreSignal de PRODUCCIÓN — cero duplicación) y
 * mide si `actionable` discrimina el acierto DIRECCIONAL de net mejor que |net|
 * solo o que el confluence viejo. Cruza con signal_outcomes (return bruto +
 * umbral ATR, reusando la lógica de scoreSignal).
 *
 * Correr:  corepack pnpm exec vitest run --config vitest.harness.config.ts
 *
 * Notas honestas:
 *  - net/κ NO dependen de K_FLOOR/G_MIN → se recomputan una vez por fila y luego
 *    se barre K_FLOOR sobre la fórmula de actionable.
 *  - El gate G_MIN de producción usa `rawMag` (no expuesto); aquí se aproxima con
 *    |net| (|net| ≤ rawMag → gatea algo más). Efecto chico; se reporta aparte.
 *  - Muestra modesta (≈178 @7d, 37 @30d) y A2 ausente en la mayoría → net ≈
 *    a1+a3 en el histórico. Resultados DIRECCIONALES, no definitivos.
 */
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { computeConfluence, mandatedDirection } from '@/agents/a4/compute';
import { scoreSignal, SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K, type Direction } from '@/lib/scoring';

function loadEnv(): Record<string, string> {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env: Record<string, string> = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = (m[2] ?? '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]!] = v;
  }
  return env;
}

const DIR_MAP: Record<'positivo' | 'negativo' | 'neutral', Direction> = {
  positivo: 'alcista',
  negativo: 'bajista',
  neutral: 'neutral',
};

interface Row {
  horizon: number;
  netPct: number;
  kappa: number;
  hitNet: boolean;
  oldConf: number;
}

function rate(xs: Row[]): number {
  return xs.length ? xs.filter((r) => r.hitNet).length / xs.length : NaN;
}

/** Spread de hit-rate entre tercil superior e inferior según un ranker. */
function tercileSpread(rows: Row[], rank: (r: Row) => number) {
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
  const k = Math.floor(sorted.length / 3);
  if (k === 0) return { top: NaN, bot: NaN, spread: NaN };
  const top = rate(sorted.slice(sorted.length - k));
  const bot = rate(sorted.slice(0, k));
  return { top, bot, spread: top - bot };
}

/** Correlación punto-biserial entre un valor continuo y hit_net (0/1). */
function pointBiserial(rows: Row[], val: (r: Row) => number): number {
  const xs = rows.map(val);
  const ys: number[] = rows.map((r) => (r.hitNet ? 1 : 0));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = xs[i]! - mx;
    const ay = ys[i]! - my;
    num += ax * ay;
    dx += ax * ax;
    dy += ay * ay;
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy);
}

const pct = (x: number) => (Number.isNaN(x) ? ' n/a' : `${(x * 100).toFixed(1)}`);
const signed = (x: number) => (Number.isNaN(x) ? ' n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`);

test('calibración K_FLOOR/G_MIN sobre histórico', async () => {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  const supa = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supa
    .from('signal_outcomes')
    .select(
      'horizon_days, return_pct, hit, analyses_log(id, confluence_pct, initial_price, a1_output, a2_output, a3_output, debate_output)'
    );
  if (error) throw error;

  const rows: Row[] = [];
  let skipped = 0;
  let netVsOld = { net: 0, old: 0 };
  for (const o of data as any[]) {
    const a = o.analyses_log;
    if (!a || !a.a3_output || a.initial_price == null) {
      skipped++;
      continue;
    }
    const d = a.debate_output;
    const debate = d ? { convergence_score: d.convergence_score, direccion: d.direccion } : null;
    let conf: ReturnType<typeof computeConfluence>;
    try {
      conf = computeConfluence({ a1: a.a1_output, a2: a.a2_output, a3: a.a3_output, debate, estructura: null });
    } catch {
      skipped++;
      continue;
    }
    const netPct = conf.net_pct ?? 0;
    const kappa = conf.kappa ?? 0;
    const netDir = DIR_MAP[mandatedDirection(netPct)];
    const initial = Number(a.initial_price);
    const ret = Number(o.return_pct);
    const evalPrice = initial * (1 + ret / 100);
    const atr = a.a3_output?.operativa?.atr_actual;
    const threshold =
      atr != null && initial > 0
        ? Math.max(SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K * (Number(atr) / initial) * 100)
        : SIGNAL_THRESHOLD_PCT;
    const hitNet = scoreSignal({ direccion: netDir, initial_price: initial, eval_price: evalPrice, threshold_pct: threshold }).hit;
    if (o.horizon_days === 7) {
      if (hitNet) netVsOld.net++;
      if (o.hit) netVsOld.old++;
    }
    rows.push({ horizon: o.horizon_days, netPct, kappa, hitNet, oldConf: Number(a.confluence_pct) });
  }

  const h7 = rows.filter((r) => r.horizon === 7);
  const h30 = rows.filter((r) => r.horizon === 30);
  const actionable = (r: Row, kFloor: number, gMin: number) =>
    Math.abs(r.netPct) < gMin ? 0 : Math.abs(r.netPct) * (kFloor + (1 - kFloor) * r.kappa);

  const L: string[] = [];
  L.push('\n══════ CALIBRACIÓN net / κ / actionable (histórico) ══════');
  L.push(`usables=${rows.length}  (7d=${h7.length}, 30d=${h30.length})  saltados=${skipped}`);
  L.push(
    `hit-rate @7d — dirección NET: ${pct(rate(h7))}%   ·   dirección VIEJA (a4): ${pct(netVsOld.old / h7.length)}%`
  );
  L.push(`κ media @7d: ${(h7.reduce((a, r) => a + r.kappa, 0) / h7.length).toFixed(2)}   |net| media: ${(h7.reduce((a, r) => a + Math.abs(r.netPct), 0) / h7.length).toFixed(1)}`);

  const G_PROD = 10;
  L.push(`\n── Sweep K_FLOOR (G_MIN=${G_PROD}) @7d · ¿discrimina hit_net? ──`);
  L.push('ranker                 corr    topT%   botT%   spread');
  for (const kf of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const ts = tercileSpread(h7, (r) => actionable(r, kf, G_PROD));
    const cr = pointBiserial(h7, (r) => actionable(r, kf, G_PROD));
    L.push(`actionable kFloor=${kf.toFixed(1)}   ${cr.toFixed(3)}   ${pct(ts.top)}   ${pct(ts.bot)}   ${signed(ts.spread)}`);
  }
  const tsNet = tercileSpread(h7, (r) => Math.abs(r.netPct));
  L.push(`|net| (sin κ)          ${pointBiserial(h7, (r) => Math.abs(r.netPct)).toFixed(3)}   ${pct(tsNet.top)}   ${pct(tsNet.bot)}   ${signed(tsNet.spread)}`);
  const tsOld = tercileSpread(h7, (r) => r.oldConf);
  L.push(`confluence VIEJO       ${pointBiserial(h7, (r) => r.oldConf).toFixed(3)}   ${pct(tsOld.top)}   ${pct(tsOld.bot)}   ${signed(tsOld.spread)}`);

  L.push(`\n── Sensibilidad G_MIN (kFloor=0.5) @7d ──`);
  for (const g of [5, 10, 15, 20]) {
    const gated = h7.filter((r) => Math.abs(r.netPct) < g).length;
    const ts = tercileSpread(h7, (r) => actionable(r, 0.5, g));
    L.push(`G_MIN=${String(g).padStart(2)}: gateados=${gated}/${h7.length}  spread=${signed(ts.spread)}`);
  }

  if (h30.length >= 20) {
    const ts = tercileSpread(h30, (r) => actionable(r, 0.5, G_PROD));
    L.push(`\n@30d (n=${h30.length}, poca muestra): hit_net=${pct(rate(h30))}%  spread(kF=0.5)=${signed(ts.spread)}`);
  } else {
    L.push(`\n@30d: n=${h30.length} — demasiado poca muestra para concluir.`);
  }

  console.log(L.join('\n'));
  expect(rows.length).toBeGreaterThan(50);
}, 90000);
