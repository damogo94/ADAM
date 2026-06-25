/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * Experimento Fase 1b (HARNESS-FIRST, data-driven). Read-only contra prod.
 *
 * El `net` de la Fase 1 ya pondera por confianza (es la magnitud de cada
 * contribución). Antes de tocar pesos a ojo, medimos sobre el histórico si dos
 * levers mejoran la DISCRIMINACIÓN direccional de actionable:
 *   (1) split de importancia A1A2 vs A3 (alternativas al WNET3 actual).
 *   (2) dampening de la confianza LLM de A1/A2 (compresión hacia 50).
 *
 * Reusa funciones EXPORTADAS de producción (scoreA1A2/scoreA3Solo/ALIVE_CAPS/
 * mandatedDirection + scoreSignal) y replica solo los helpers de dirección
 * (mirror de compute.ts) — con un sanity-check de que el net replicado con los
 * pesos actuales == net_pct de computeConfluence.
 *
 * Correr:  corepack pnpm exec vitest run --config vitest.harness.config.ts scripts/experiment-fase1b.ts
 *
 * CAVEAT CLAVE: A2 está ausente en ~178/215 filas → el bloque A1A2 cae a A1-solo
 * (×0.33) y el técnico (A3) domina el net. Por eso ambos levers pueden mover
 * poco la discriminación — eso, de salir, ES el hallazgo (no cambiar a ciegas).
 */
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  computeConfluence,
  scoreA1A2,
  scoreA3Solo,
  ALIVE_CAPS,
  mandatedDirection,
} from '@/agents/a4/compute';
import { scoreSignal, SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K, type Direction } from '@/lib/scoring';

function loadEnv(): Record<string, string> {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env: Record<string, string> = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = (m[2] ?? '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]!] = v;
  }
  return env;
}

// ── Mirror de los helpers de dirección de compute.ts (mantener en sync) ──────
const dirA1 = (a1: any): number => (a1?.anomaly_type === 'oportunidad' ? 1 : a1?.anomaly_type === 'vulnerabilidad' ? -1 : 0);
const dirA2 = (a2: any): number => {
  if (!a2) return 0;
  if (a2.regime_outlook === 'risk_on') return 1;
  if (a2.regime_outlook === 'risk_off') return -1;
  if (a2.regime_outlook === 'neutral') return 0;
  return a2.opportunity_detected ? 1 : 0;
};
const dirA3 = (a3: any): number => {
  if (a3?.operativa?.signal === 'buy') return 1;
  if (a3?.operativa?.signal === 'sell') return -1;
  if (a3?.tendencia?.primaria === 'alcista') return 1;
  if (a3?.tendencia?.primaria === 'bajista') return -1;
  return 0;
};
const dirA12 = (a1: any, a2: any, debate: any): number => {
  if (debate) return debate.direccion === 'alcista' ? 1 : debate.direccion === 'bajista' ? -1 : 0;
  const ds = [dirA1(a1), dirA2(a2)].filter((x) => x !== 0);
  if (ds.length === 0) return 0;
  if (ds.every((x) => x > 0)) return 1;
  if (ds.every((x) => x < 0)) return -1;
  return 0;
};

function combine(blocks: { w: number; c: number }[], cap: number): number {
  const ws = blocks.reduce((s, b) => s + b.w, 0);
  if (ws === 0) return 0;
  const net = blocks.reduce((s, b) => s + b.w * b.c, 0) / ws;
  return Math.sign(net) * Math.min(Math.abs(net), cap);
}

const damp = (agent: any, alpha: number): any =>
  agent ? { ...agent, confidence: Math.max(0, Math.min(100, 50 + (agent.confidence - 50) * alpha)) } : agent;

const DIR_MAP: Record<'positivo' | 'negativo' | 'neutral', Direction> = { positivo: 'alcista', negativo: 'bajista', neutral: 'neutral' };
const KF = 0.5;
const GMIN = 10;

interface Row {
  horizon: number;
  a1: any; a2: any; a3: any; debate: any;
  a3Score: number; dA3: number; dA12: number; kappa: number;
  cap: number; initial: number; ret: number; threshold: number; netProd: number;
}

function rate(xs: { hit: boolean }[]): number {
  return xs.length ? xs.filter((r) => r.hit).length / xs.length : NaN;
}
function tercileSpread(xs: { v: number; hit: boolean }[]): number {
  const s = [...xs].sort((a, b) => a.v - b.v);
  const k = Math.floor(s.length / 3);
  if (k === 0) return NaN;
  const top = rate(s.slice(s.length - k));
  const bot = rate(s.slice(0, k));
  return top - bot;
}
const sp = (x: number) => (Number.isNaN(x) ? ' n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`);

function hitOf(net: number, r: Row): boolean {
  const dir = DIR_MAP[mandatedDirection(net)];
  return scoreSignal({ direccion: dir, initial_price: r.initial, eval_price: r.initial * (1 + r.ret / 100), threshold_pct: r.threshold }).hit;
}
const actionable = (net: number, kappa: number) => (Math.abs(net) < GMIN ? 0 : Math.abs(net) * (KF + (1 - KF) * kappa));

test('experimento Fase 1b — split de importancia + dampening A1/A2', async () => {
  const env = loadEnv();
  const supa = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supa
    .from('signal_outcomes')
    .select('horizon_days, return_pct, hit, analyses_log(initial_price, a1_output, a2_output, a3_output, debate_output)');
  if (error) throw error;

  const rows: Row[] = [];
  let mismatch = 0;
  for (const o of data as any[]) {
    const a = o.analyses_log;
    if (!a || !a.a3_output || a.initial_price == null) continue;
    const a1 = a.a1_output, a2 = a.a2_output, a3 = a.a3_output;
    const debate = a.debate_output ? { convergence_score: a.debate_output.convergence_score, direccion: a.debate_output.direccion } : null;
    let conf: ReturnType<typeof computeConfluence>;
    try {
      conf = computeConfluence({ a1, a2, a3, debate, estructura: null });
    } catch {
      continue;
    }
    const initial = Number(a.initial_price);
    const atr = a3?.operativa?.atr_actual;
    const threshold = atr != null && initial > 0 ? Math.max(SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K * (Number(atr) / initial) * 100) : SIGNAL_THRESHOLD_PCT;
    const aliveCount = [a1, a2, a3].filter((x) => x != null).length;
    const r: Row = {
      horizon: o.horizon_days, a1, a2, a3, debate,
      a3Score: scoreA3Solo(a3 as any), dA3: dirA3(a3), dA12: dirA12(a1, a2, debate), kappa: conf.kappa ?? 0,
      cap: ALIVE_CAPS[aliveCount] ?? 100, initial, ret: Number(o.return_pct), threshold, netProd: conf.net_pct ?? 0,
    };
    // sanity: net replicado con pesos ACTUALES (3-patas 0.571/0.429) == net_pct prod
    const a12Score = scoreA1A2(a1 as any, a2 as any, debate);
    const netRepl = combine([{ w: 0.571, c: r.dA12 * a12Score }, { w: 0.429, c: r.dA3 * r.a3Score }], r.cap);
    if (Math.abs(Math.round(netRepl) - r.netProd) > 1) mismatch++;
    rows.push(r);
  }
  const h7 = rows.filter((r) => r.horizon === 7);

  const L: string[] = [];
  L.push('\n══════ EXPERIMENTO Fase 1b (histórico @7d) ══════');
  L.push(`filas=${rows.length} (7d=${h7.length}) · sanity mismatch net replicado vs prod: ${mismatch} (debe ser 0)`);
  L.push(`con A2: ${h7.filter((r) => r.a2 != null).length}/${h7.length} (recordatorio: A1A2 cae a A1-solo sin A2)`);

  // ── Lever 1: split de importancia A1A2/A3 ──
  L.push('\n── Lever 1 · split importancia (A1A2 / A3) @7d ──');
  L.push('split A1A2/A3      hit_net%   spread(actionable)');
  for (const [wA12, wA3] of [[0.7, 0.3], [0.571, 0.429], [0.5, 0.5], [0.4, 0.6], [0.3, 0.7]] as const) {
    const ev = h7.map((r) => {
      const a12 = scoreA1A2(r.a1, r.a2, r.debate);
      const net = combine([{ w: wA12, c: r.dA12 * a12 }, { w: wA3, c: r.dA3 * r.a3Score }], r.cap);
      return { v: actionable(net, r.kappa), hit: hitOf(net, r) };
    });
    const cur = Math.abs(wA12 - 0.571) < 0.001 ? '  ← actual' : '';
    L.push(`${wA12.toFixed(3)}/${wA3.toFixed(3)}     ${(rate(ev) * 100).toFixed(1)}      ${sp(tercileSpread(ev))}${cur}`);
  }

  // ── Lever 2: dampening confianza A1/A2 (compresión hacia 50) ──
  L.push('\n── Lever 2 · dampening confianza A1/A2 (α; 1.0=sin dampear) @7d, pesos actuales ──');
  L.push('α       hit_net%   spread(actionable)');
  for (const alpha of [1.0, 0.7, 0.5, 0.3, 0.0]) {
    const ev = h7.map((r) => {
      const a12 = scoreA1A2(damp(r.a1, alpha), damp(r.a2, alpha), r.debate);
      const net = combine([{ w: 0.571, c: r.dA12 * a12 }, { w: 0.429, c: r.dA3 * r.a3Score }], r.cap);
      return { v: actionable(net, r.kappa), hit: hitOf(net, r) };
    });
    L.push(`${alpha.toFixed(1)}     ${(rate(ev) * 100).toFixed(1)}      ${sp(tercileSpread(ev))}${alpha === 1.0 ? '  ← actual' : ''}`);
  }

  console.log(L.join('\n'));
  expect(mismatch).toBe(0); // si falla, mi replicación de direcciones diverge de prod
  expect(h7.length).toBeGreaterThan(50);
}, 90000);
