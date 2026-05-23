/**
 * Distancia a entrada/stop/target del setup de A3 vs el precio actual.
 *
 * Función PURA. Recibe el snapshot ya normalizado y el current_price
 * obtenido fuera (de fallbackQuote en el endpoint). Devuelve los %
 * relativos en formato consumible por el UI (% signed, current vs ref).
 *
 * Semántica del %:
 *   - to_entry_pct  = ((current - entrada)  / entrada)  * 100
 *   - to_stop_pct   = ((current - stop)     / stop)     * 100
 *   - to_target_pct = ((current - target)   / target)   * 100
 *
 * Positivo → current está por ENCIMA del nivel. Negativo → por DEBAJO.
 * El componente UI decide el icono según el `a3_signal`.
 *
 * `actionable`:
 *   La fila se considera accionable AHORA si |to_entry_pct| <= 2.
 *   Es una heurística conservadora — el setup de A3 sigue siendo válido
 *   en un rango cercano a la entrada definida.
 */

import type { RadarAnalysisSnapshot_t, RadarDistances_t } from './types';

const ACTIONABLE_BAND_PCT = 2;

export function computeDistances(
  latest: RadarAnalysisSnapshot_t | null,
  currentPrice: number | null
): RadarDistances_t {
  // Sin análisis o sin precio actual no podemos calcular nada útil.
  if (!latest || currentPrice === null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      to_entry_pct: null,
      to_stop_pct: null,
      to_target_pct: null,
      risk_reward: latest?.a3_risk_reward ?? null,
      actionable: false,
    };
  }

  const pctVs = (ref: number | null): number | null => {
    if (ref === null || !Number.isFinite(ref) || ref <= 0) return null;
    return ((currentPrice - ref) / ref) * 100;
  };

  const toEntry = pctVs(latest.a3_entry);
  const toStop = pctVs(latest.a3_stop);
  const toTarget = pctVs(latest.a3_target);

  const actionable =
    toEntry !== null && Math.abs(toEntry) <= ACTIONABLE_BAND_PCT;

  return {
    to_entry_pct: toEntry,
    to_stop_pct: toStop,
    to_target_pct: toTarget,
    risk_reward: latest.a3_risk_reward,
    actionable,
  };
}
