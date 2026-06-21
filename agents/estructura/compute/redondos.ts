/**
 * A.D.A.M. — Estructura · números redondos (precios psicológicos)
 *
 * Manual §3: "El mercado busca la liquidez que reside en números cerrados
 * (figuras completas o medias figuras terminadas en 00 o 50). Estos precios
 * actúan como imanes naturales."
 *
 * El "paso" del grid de redondos se deriva de la MAGNITUD del precio para que
 * caiga en números genuinamente psicológicos según el instrumento:
 *   - Oro ~2000     → paso 50  (2000, 2050, 2100 …)
 *   - NAS100 ~20000 → paso 500 (20000, 20500, 21000 …)
 *   - Forex 1.0850  → paso 0.0050 (50 pips; override por clase)
 *
 * Determinista, sin estado. Cero LLM.
 */

import { roundProfile, type AssetProfile } from '@/agents/a3/profiles';

export interface RedondoResult {
  /** Número redondo más cercano al nivel consultado. */
  nivel: number;
  /** Distancia |nivel - redondo| en % del nivel. */
  distancia_pct: number;
}

/**
 * Paso del grid de redondos para un precio dado. `magnitud/20` aterriza en la
 * rejilla "…00/…50" para activos de precio entero; forex usa 50 pips fijos.
 */
export function roundStep(price: number, profile: AssetProfile): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (profile.class === 'forex') return 0.005; // 50 pips
  const magnitud = Math.pow(10, Math.floor(Math.log10(price)));
  return magnitud / 20;
}

/**
 * Número redondo más cercano a `nivel` (no al precio actual: la confluencia
 * se evalúa sobre la ZONA de retesteo). Devuelve `null` si el nivel no es
 * válido.
 */
export function nearestRound(
  nivel: number,
  profile: AssetProfile
): RedondoResult | null {
  if (!Number.isFinite(nivel) || nivel <= 0) return null;
  const step = roundStep(nivel, profile);
  if (step <= 0) return null;

  const redondo = roundProfile(Math.round(nivel / step) * step, profile);
  const distancia_pct = Math.abs(nivel - redondo) / nivel * 100;
  return { nivel: redondo, distancia_pct };
}
