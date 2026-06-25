/**
 * Consolidación A4 + persistencia — lógica compartida.
 *
 * Toma outputs YA calculados (A1/A2/A3 + debate opcional), corre
 * computeConfluence (determinístico) + narrateA4 (1 call Haiku) y, si se
 * pasa `analysisId`, ACTUALIZA la fila de analyses_log con el A4 re-narrado.
 *
 * Extraído de /api/agents/a4 para reusarlo desde el cron de reconciliación
 * de A2 (backfill server-side). Single source of truth de QUÉ columnas se
 * persisten al re-narrar — en particular los ejes Fase 1 (net_pct/kappa/
 * actionable_pct), que la versión vieja del endpoint NO actualizaba y se
 * quedaban stale respecto al confluence_pct recomputado.
 */

import 'server-only';
import { narrateA4 } from '@/agents/a4/narrate';
import { computeConfluence, type DebateForConfluence } from '@/agents/a4/compute';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  A1Output_t,
  A2Output_t,
  A3Output_t,
  A4Output_t,
} from '@/agents/shared/types';

export interface ConsolidateA4Input {
  ticker: string;
  a1: A1Output_t | null;
  a2: A2Output_t | null;
  a3: A3Output_t | null;
  debate: DebateForConfluence | null;
  /**
   * Si viene (junto con userId), persiste el A4 re-narrado en analyses_log.
   * Sin id → solo consolida y devuelve (no toca la BD).
   */
  analysisId?: string | null;
  userId?: string | null;
  traceId?: string;
}

/**
 * Consolida A4 y, opcionalmente, persiste el resultado en analyses_log.
 * La persistencia es best-effort: un fallo de BD NO rompe la consolidación
 * (el caller siempre recibe el A4 re-narrado).
 */
export async function consolidateAndPersistA4(
  input: ConsolidateA4Input
): Promise<A4Output_t> {
  const { ticker, a1, a2, a3, debate, analysisId, userId, traceId } = input;

  const confluence = computeConfluence({ a1, a2, a3, debate });
  const a4 = await narrateA4({ ticker, a1, a2, a3, debate, confluence, failures: [] }, { traceId });

  if (analysisId && userId) {
    try {
      const admin = createSupabaseAdmin();
      await admin
        .from('analyses_log')
        .update({
          a2_output: a2,
          a4_output: a4,
          confluence_pct: a4.confluence.score_total_pct,
          // Ejes Fase 1 — DEBEN ir junto a confluence_pct o quedan incoherentes
          // (el confluence se recomputa con A2 completo pero los ejes no).
          net_pct: confluence.net_pct ?? null,
          kappa: confluence.kappa ?? null,
          actionable_pct: confluence.actionable_pct ?? null,
          confidence: a4.confianza,
          direction: a4.direccion,
        })
        .eq('id', analysisId)
        .eq('user_id', userId);
    } catch (updErr) {
      // eslint-disable-next-line no-console
      console.error(
        '[a4-consolidate] persist update failed:',
        updErr instanceof Error ? updErr.message : updErr
      );
    }
  }

  return a4;
}
