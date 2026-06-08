/**
 * Orquesta la construcción de un `RadarRow_t` a partir de un row crudo
 * de la RPC + el quote actual (ya obtenido externamente).
 *
 * Función PURA (no toca red ni DB). Útil de aislar para tests y para
 * el endpoint que solo se encarga de fetch + paralelismo.
 */

import { computeDelta } from './compute-delta';
import { computeDistances } from './compute-distances';
import { computeStale } from './compute-stale';
import { computeDivergence } from './compute-divergence';
import { normalizeAnalysis } from './normalize';
import { normalizeSignal } from './normalize-signal';
import type { RadarQuote_t, RadarRow_t, RpcRadarRow_t } from './types';

export function buildRow(
  rpcRow: RpcRadarRow_t,
  quote: RadarQuote_t | null,
  now: Date = new Date()
): RadarRow_t {
  const latest = normalizeAnalysis(rpcRow.latest_analysis);
  const previous = normalizeAnalysis(rpcRow.previous_analysis);
  const signal = normalizeSignal(rpcRow.latest_unacked_signal);

  const delta = computeDelta(latest, previous);
  const distances = latest ? computeDistances(latest, quote?.current ?? null) : null;
  const isStale = computeStale(latest?.created_at, now);
  // Desacuerdo en dos ejes — derivado de los intermedios crudos (a1/a2/a3/debate)
  // del propio análisis, no del snapshot. Con latest null → todos los ejes
  // 'unavailable' (no hay agentes que comparar).
  const divergence = computeDivergence(rpcRow.latest_analysis);

  return {
    item_id: rpcRow.item_id,
    ticker: rpcRow.ticker,
    asset_type: rpcRow.asset_type,
    position: rpcRow.position,
    notes: rpcRow.notes,
    added_at: rpcRow.added_at,
    is_pinned: rpcRow.is_pinned,
    pinned_at: rpcRow.pinned_at,
    quote,
    latest,
    delta,
    distances,
    signal,
    divergence,
    is_stale: isStale,
  };
}
