/**
 * Confluence math — portado de adam_demo.html updateConf() pero adaptado a
 * nuestros schemas reales (A1Output, A2Output, A3Output, DebateOutput, A4Output).
 *
 * Tres aportes ponderados:
 *   - A3 solo:    max 30% (technical signal confidence)
 *   - A1 + A2:    max 40% (debate convergence × combined confidence)
 *   - Alineados:  max 30% (A3 direction matches debate/A4 direction)
 *
 * Nivel:
 *   ≥ 67% → alta
 *   ≥ 34% → media
 *   <  34% → baja
 */

import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';

export type ConfluenceLevel = 'baja' | 'media' | 'alta';

export interface ConfluenceResult {
  a3_solo: { score: number; pct: number };
  a1_a2: { score: number; pct: number };
  alineados: { score: number; pct: number };
  total_pct: number;
  level: ConfluenceLevel;
  direction: 'alcista' | 'bajista' | 'neutral';
  aligned: boolean;
}

function levelFromPct(pct: number): ConfluenceLevel {
  if (pct >= 67) return 'alta';
  if (pct >= 34) return 'media';
  return 'baja';
}

export function computeConfluence(
  a1: A1Output | null,
  a2: A2Output | null,
  a3: A3Output | null,
  debate: DebateOutput | null
): ConfluenceResult {
  // ─── A3 solo (max 30%) ──────────────────────────────────────────
  const a3Conf = a3?.confidence ?? 0;
  const a3Pct = Math.round((a3Conf / 5) * 30);

  // ─── A1 + A2 (max 40%) ──────────────────────────────────────────
  // Si hubo debate: usa convergence_score (1-5) directamente.
  // Si no hubo: usa promedio de a1.confidence y a2.confidence si ambos coinciden
  // direccionalmente (anomaly_detected || opportunity_detected).
  let a12Pct = 0;
  if (debate) {
    const conv = debate.convergence_score / 5;
    const combined = (((a1?.confidence ?? 0) + (a2?.confidence ?? 0)) / 2) / 5;
    a12Pct = Math.round(conv * combined * 40);
  } else if (a1 && a2) {
    const avg = ((a1.confidence + a2.confidence) / 2) / 5;
    a12Pct = Math.round(avg * 20); // half if no debate confirmed
  }

  // ─── Alineados (max 30%) ────────────────────────────────────────
  // A3 alineado con la dirección del debate o (en su ausencia) con
  // a1.anomaly_detected + a2.opportunity_detected como proxy direccional.
  const a3Direction = a3?.operativa.signal === 'buy'
    ? 'alcista'
    : a3?.operativa.signal === 'sell'
      ? 'bajista'
      : 'neutral';
  const debateDirection = debate?.direccion;
  const aligned =
    debateDirection === a3Direction && debateDirection !== 'neutral' && a3Direction !== 'neutral';
  const aPct = aligned ? 30 : 0;

  const total = Math.min(100, a3Pct + a12Pct + aPct);
  const level = levelFromPct(total);

  return {
    a3_solo: { score: Math.round(a3Conf), pct: a3Pct },
    a1_a2: {
      score: debate ? debate.convergence_score : Math.round(((a1?.confidence ?? 0) + (a2?.confidence ?? 0)) / 2),
      pct: a12Pct,
    },
    alineados: { score: aligned ? 5 : 0, pct: aPct },
    total_pct: total,
    level,
    direction: debateDirection ?? a3Direction,
    aligned,
  };
}
