/**
 * Confluence math — escala 0-100.
 *
 * Tres aportes ponderados al score total (max 100%):
 *   - A3 solo:    max 30%  (technical signal confidence)
 *   - A1 + A2:    max 40%  (debate convergence × combined confidence)
 *   - Alineados:  max 30%  (A3 direction matches debate/A4 direction)
 *
 * Niveles (sobre score_total):
 *   ≥ 67% → alta
 *   ≥ 34% → media
 *   <  34% → baja
 *
 * NOTA: con sesión 6 todas las confianzas son 0-100 (antes 1-5).
 * Mantenemos la lógica de ponderación, solo cambia el divisor (100 en vez de 5).
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
  const a3Conf = a3?.confidence ?? 0; // 0-100
  const a3Pct = Math.round((a3Conf / 100) * 30);

  // ─── A1 + A2 (max 40%) ──────────────────────────────────────────
  // Si hubo debate: usa convergence_score (0-100) × combined confidence.
  // Si no hubo: usa promedio de a1.confidence y a2.confidence como proxy,
  // capeado a la mitad (max 20%) porque no hay validación cruzada.
  let a12Pct = 0;
  if (debate) {
    const conv = debate.convergence_score / 100;
    const combined = ((a1?.confidence ?? 0) + (a2?.confidence ?? 0)) / 2 / 100;
    a12Pct = Math.round(conv * combined * 40);
  } else if (a1 && a2) {
    const avg = (a1.confidence + a2.confidence) / 2 / 100;
    a12Pct = Math.round(avg * 20); // half si no hubo debate confirmado
  }

  // ─── Alineados (max 30%) ────────────────────────────────────────
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
    alineados: { score: aligned ? 100 : 0, pct: aPct },
    total_pct: total,
    level,
    direction: debateDirection ?? a3Direction,
    aligned,
  };
}
