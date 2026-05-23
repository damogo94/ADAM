/**
 * Delta entre el último análisis y el inmediatamente anterior para un
 * mismo (user, ticker). Decisión A de FASE 0.
 *
 * Función PURA — no toca red ni DB. Recibe los dos snapshots ya
 * normalizados y devuelve un `RadarDelta` validable contra Zod.
 *
 * Casos:
 *   - latest=null            → todo a "sin cambio". El caller decidirá
 *                              si pinta la fila como "sin análisis".
 *   - latest≠null, prev=null → primer análisis del ticker. `has_previous`
 *                              queda false; si A1 detectó anomalía, la
 *                              marcamos `anomaly_new=true` porque es la
 *                              primera vez que aparece.
 *   - ambos presentes        → cálculos normales.
 */

import type { RadarAnalysisSnapshot_t, RadarDelta_t } from './types';

export function computeDelta(
  latest: RadarAnalysisSnapshot_t | null,
  previous: RadarAnalysisSnapshot_t | null
): RadarDelta_t {
  if (!latest) {
    return {
      confluence_delta_pct: null,
      direction_flipped: false,
      a3_signal_flipped: false,
      anomaly_new: false,
      has_previous: false,
    };
  }

  if (!previous) {
    // Sin baseline no hay flips reales. Pero si A1 marcó anomalía en
    // este primer run, lo consideramos "nuevo" — es información nueva
    // para el usuario aunque no haya comparativa formal.
    return {
      confluence_delta_pct: null,
      direction_flipped: false,
      a3_signal_flipped: false,
      anomaly_new: latest.a1_anomaly_detected === true,
      has_previous: false,
    };
  }

  const confluenceDelta = latest.confluence_pct - previous.confluence_pct;
  const directionFlipped = latest.direction !== previous.direction;

  // A3 flip: solo si ambos tienen signal definido y son distintos.
  // (Si uno es null, no es un flip — es ruido de cobertura.)
  const a3Flipped =
    latest.a3_signal !== null &&
    previous.a3_signal !== null &&
    latest.a3_signal !== previous.a3_signal;

  // Anomaly NEW: A1 la detecta AHORA y no la detectaba antes. Si ambos
  // la detectan y el `type` cambió (oportunidad → vulnerabilidad), también
  // lo consideramos "nuevo" porque cambia el sentido de la alerta.
  const wasDetected = previous.a1_anomaly_detected === true;
  const isDetected = latest.a1_anomaly_detected === true;
  const typeChanged =
    isDetected &&
    wasDetected &&
    latest.a1_anomaly_type !== previous.a1_anomaly_type;
  const anomalyNew = (isDetected && !wasDetected) || typeChanged;

  return {
    confluence_delta_pct: confluenceDelta,
    direction_flipped: directionFlipped,
    a3_signal_flipped: a3Flipped,
    anomaly_new: anomalyNew,
    has_previous: true,
  };
}
