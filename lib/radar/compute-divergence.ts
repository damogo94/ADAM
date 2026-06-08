/**
 * computeDivergence — el desacuerdo entre agentes en DOS EJES SEPARADOS.
 *
 * El valor de ADAM está en el desacuerdo, pero no es uno, son dos:
 *   1. Divergencia NARRATIVA  (A1 ↔ A2): los dos agentes narrativos.
 *   2. (Des)alineación TÉCNICA (A3 vs consenso narrativo): A3 está AISLADO, así
 *      que su consenso de referencia es A1+A2 — NO A4, que ya incluye A3
 *      (usar A4 refundiría A3 con lo narrativo).
 *
 * Función PURA: recibe el jsonb crudo de `analyses_log` (lo que la RPC mete en
 * latest_analysis) y deriva los ejes de los intermedios YA persistidos
 * (a1/a2/a3/debate). Cero runs nuevos, cero coste LLM.
 *
 * Honestidad con datos parciales: si falta un agente, el eje afectado es
 * 'unavailable' (nunca "alineado" — el desacuerdo no existe con 2 de 3).
 */

import { z } from 'zod';
import type { RadarDivergence_t, RadarLean_t } from './types';

// Subsets mínimos de cada agente para derivar su sesgo direccional. passthrough:
// el jsonb tiene más campos que ignoramos.
const A1Lean = z
  .object({
    anomaly_detected: z.boolean().optional(),
    anomaly_type: z.enum(['anomalia', 'vulnerabilidad', 'oportunidad']).nullable().optional(),
  })
  .passthrough();

const A2Lean = z
  .object({
    regime_outlook: z.enum(['risk_on', 'risk_off', 'neutral']).nullable().optional(),
    opportunity_detected: z.boolean().optional(),
  })
  .passthrough();

const A3Lean = z
  .object({
    tendencia: z.object({ primaria: z.string().optional() }).passthrough().optional(),
    operativa: z.object({ signal: z.enum(['buy', 'sell', 'hold']).optional() }).passthrough().optional(),
  })
  .passthrough();

const DebateLean = z
  .object({
    convergence_score: z.number().optional(),
    direccion: z.string().optional(),
  })
  .passthrough();

interface AnalysisRaw {
  a1_output?: unknown;
  a2_output?: unknown;
  a3_output?: unknown;
  debate_output?: unknown;
}

/** Sesgo de A1 desde su anomalía (oportunidad=alza · vulnerabilidad=baja). */
function a1Lean(raw: unknown): RadarLean_t | null {
  const p = A1Lean.safeParse(raw);
  if (!p.success) return null; // agente caído / output inválido
  const t = p.data.anomaly_type;
  if (t === 'oportunidad') return 'up';
  if (t === 'vulnerabilidad') return 'down';
  return 'flat'; // anomalia / sin anomalía → sin sesgo direccional
}

/** Sesgo de A2 desde el régimen macro (fallback: opportunity_detected). */
function a2Lean(raw: unknown): RadarLean_t | null {
  const p = A2Lean.safeParse(raw);
  if (!p.success) return null;
  const r = p.data.regime_outlook;
  if (r === 'risk_on') return 'up';
  if (r === 'risk_off') return 'down';
  if (r === 'neutral') return 'flat';
  // regime_outlook ausente (runs antiguos): fallback documentado en el schema.
  return p.data.opportunity_detected ? 'up' : 'flat';
}

/** Sesgo de A3 desde la tendencia primaria (fallback: signal operativo). */
function a3Lean(raw: unknown): RadarLean_t | null {
  const p = A3Lean.safeParse(raw);
  if (!p.success) return null;
  const prim = p.data.tendencia?.primaria;
  if (prim === 'alcista') return 'up';
  if (prim === 'bajista') return 'down';
  if (prim === 'lateral') return 'flat';
  const sig = p.data.operativa?.signal;
  if (sig === 'buy') return 'up';
  if (sig === 'sell') return 'down';
  if (sig === 'hold') return 'flat';
  return 'flat';
}

export function computeDivergence(rawLatest: unknown): RadarDivergence_t {
  const raw = (rawLatest && typeof rawLatest === 'object' ? rawLatest : {}) as AnalysisRaw;

  // Agente "vivo" = su output existe y no es null (la pipeline persiste null
  // cuando un agente cayó). a1Lean/a2Lean/a3Lean devuelven null si no parsea.
  const a1 = raw.a1_output != null ? a1Lean(raw.a1_output) : null;
  const a2 = raw.a2_output != null ? a2Lean(raw.a2_output) : null;
  const a3 = raw.a3_output != null ? a3Lean(raw.a3_output) : null;

  const alive = { a1: a1 !== null, a2: a2 !== null, a3: a3 !== null };
  const aliveCount = Number(alive.a1) + Number(alive.a2) + Number(alive.a3);

  // ── Eje 1: divergencia narrativa A1 ↔ A2 ──────────────────────────────
  let narrativeState: RadarDivergence_t['narrative']['state'];
  if (a1 === null || a2 === null) {
    narrativeState = 'unavailable'; // no existe con un narrativo faltante
  } else if (a1 === 'flat' || a2 === 'flat') {
    narrativeState = 'mixed'; // uno sin sesgo claro
  } else {
    narrativeState = a1 === a2 ? 'aligned' : 'divergent';
  }

  const debate = DebateLean.safeParse(raw.debate_output);
  const debateConvergence =
    debate.success && typeof debate.data.convergence_score === 'number'
      ? debate.data.convergence_score
      : null;

  // ── Consenso narrativo (A1+A2 SOLO, sin A3) para el eje técnico ────────
  let consensus: RadarLean_t | null = null;
  if (a1 !== null && a2 !== null) {
    consensus = a1 === a2 ? a1 : 'flat'; // si divergen, no hay dirección clara
  }

  // ── Eje 2: (des)alineación técnica A3 vs consenso narrativo ────────────
  let technicalState: RadarDivergence_t['technical']['state'];
  if (a3 === null || consensus === null) {
    technicalState = 'unavailable';
  } else if (a3 === 'flat' || consensus === 'flat') {
    technicalState = 'neutral'; // sin (des)alineación marcada
  } else {
    technicalState = a3 === consensus ? 'aligned' : 'divergent';
  }

  return {
    agents_alive: alive,
    alive_count: aliveCount,
    narrative: { state: narrativeState, a1, a2, debate_convergence: debateConvergence },
    technical: { state: technicalState, a3, narrative_consensus: consensus },
  };
}
