/**
 * Frescura de DOS relojes (QW2).
 *
 * El veredicto y el dato son relojes distintos y pueden divergir: un análisis
 * de hace 2h sigue siendo "reciente" en el tiempo, pero si el precio se ha
 * movido un 6% desde que se emitió, el veredicto ya no describe el mercado de
 * ahora. Mostrar solo el reloj del tiempo (lo que hace hoy `is_stale`) miente.
 *
 *   - Reloj 1 (tiempo): edad del veredicto → ya lo cubre `computeStale`.
 *   - Reloj 2 (dato): cuánto se ha movido el precio desde el veredicto, usando
 *     `initial_price` (el precio al ejecutar el análisis, persistido en
 *     analyses_log) vs el quote vivo.
 *
 * Función PURA. Devuelve null cuando no se puede calcular (sin quote, sin
 * initial_price, o initial_price 0) — el caller muestra "—", no inventa 0.
 */

/** Umbral del reloj 2: drift de precio que se considera "movido" (re-evaluar). */
export const PRICE_DRIFT_THRESHOLD_PCT = 3;

export function computePriceDrift(rawLatest: unknown, currentPrice: number | null): number | null {
  if (currentPrice === null || !Number.isFinite(currentPrice)) return null;
  if (!rawLatest || typeof rawLatest !== 'object') return null;
  const ip = (rawLatest as { initial_price?: unknown }).initial_price;
  if (typeof ip !== 'number' || !Number.isFinite(ip) || ip === 0) return null;
  return ((currentPrice - ip) / ip) * 100;
}

/** ¿El precio se ha movido lo suficiente desde el veredicto como para avisar? */
export function priceMoved(driftPct: number | null): boolean {
  return driftPct !== null && Math.abs(driftPct) >= PRICE_DRIFT_THRESHOLD_PCT;
}
