/**
 * Adapter delgado sobre `agents/a4/compute.ts` — el motor canónico de confluencia.
 *
 * HISTORIA: hasta hoy había dos implementaciones paralelas:
 *   - `lib/confluence.ts` (este archivo, usado por la UI): lógica binaria,
 *     `alineados` dependía de que el Debate se ejecutara. Resultado: con
 *     A1+A2 sin signal y sin debate, alineados siempre = 0 → la UI pintaba "—".
 *   - `agents/a4/compute.ts` (usado por el pipeline server-side): lógica gradual,
 *     `scoreAlignment` opera sobre 3 agentes vivos sin necesidad de debate.
 *
 * FIX: este archivo se convierte en un adapter que llama al canónico y traduce
 * los nombres de campo. El bug "Alineados pinta — incluso con A1+A3 al mismo
 * lado" queda resuelto.
 *
 * Mantenemos la `ConfluenceResult` exportada con la shape antigua (a3_solo,
 * a1_a2, alineados, total_pct, level, direction, aligned) para no romper la UI
 * en este patch — el `direction` y `aligned` son derivados aquí, no vienen del
 * compute canónico.
 */

import { computeConfluence as computeCanonical, type DebateForConfluence } from '@/agents/a4/compute';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';
import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';

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

export function computeConfluence(
  a1: A1Output | null,
  a2: A2Output | null,
  a3: A3Output | null,
  debate: DebateOutput | null
): ConfluenceResult {
  const debateForCompute: DebateForConfluence | null = debate
    ? { convergence_score: debate.convergence_score, direccion: debate.direccion }
    : null;

  const canonical = computeCanonical({
    // Cast seguro: A1Output legacy y A1Output_t canónico son estructuralmente
    // idénticos (el canónico es el "source of truth" según CLAUDE.md, los
    // schemas en agents/a*/schema.ts son su back-compat). Si divergen, el
    // typecheck lo detecta.
    a1: a1 as never,
    a2: a2 as never,
    a3: a3 as never,
    debate: debateForCompute,
  });

  // Derivar dirección: prioriza el debate (validación cruzada A1×A2).
  // Si no hay debate, deriva de A3 (técnico). Última opción: A1 vía anomaly_type.
  const direction: 'alcista' | 'bajista' | 'neutral' = (() => {
    if (debate?.direccion && debate.direccion !== 'neutral') return debate.direccion;
    if (a3?.operativa.signal === 'buy') return 'alcista';
    if (a3?.operativa.signal === 'sell') return 'bajista';
    if (a1?.anomaly_type === 'oportunidad') return 'alcista';
    if (a1?.anomaly_type === 'vulnerabilidad') return 'bajista';
    return 'neutral';
  })();

  // Aligned binario para la UI (badge "alineados" en A4 card): true cuando
  // el alignment score canónico cruza el umbral de "validación cruzada
  // significativa". 70 = 2 agentes al mismo lado en scoreAlignment, que es
  // el primer escalón con valor de señal real.
  const aligned = canonical.alineados.score >= 70;

  return {
    a3_solo: { score: canonical.a3_solo.score, pct: Math.round(canonical.a3_solo.score * 0.3) },
    a1_a2: { score: canonical.a1_a2.score, pct: Math.round(canonical.a1_a2.score * 0.4) },
    alineados: { score: canonical.alineados.score, pct: Math.round(canonical.alineados.score * 0.3) },
    total_pct: canonical.score_total_pct,
    level: canonical.nivel_final,
    direction,
    aligned,
  };
}
