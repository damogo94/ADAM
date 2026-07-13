/**
 * Scoring de señales — Modo B de backtesting.
 *
 *   - alcista  → hit si return_pct >=  +threshold
 *   - bajista  → hit si return_pct <=  -threshold
 *   - neutral  → hit si |return_pct| <  threshold
 *
 * El `threshold` es parametrizable (`threshold_pct`). Por defecto 2% fijo
 * (compatibilidad con outcomes ya persistidos). El caller (cron evaluate-signals)
 * lo deriva del ATR del activo → `max(2%, SIGNAL_ATR_K · ATR%)`, de modo que un
 * 2% en BTC (ruido diario) NO cuente igual que un 2% en una equity. Sin esto, el
 * hit-rate mezcla clases de activo con volatilidades incomparables.
 */

/** Piso del umbral de hit (también el default v1 cuando no se pasa ATR). */
export const SIGNAL_THRESHOLD_PCT = 2.0;
/** Múltiplo de ATR% que define el umbral de "movimiento significativo". Tunable. */
export const SIGNAL_ATR_K = 1.0;

export type Direction = 'alcista' | 'bajista' | 'neutral';

export interface ScoreSignalInput {
  direccion: Direction;
  initial_price: number;
  eval_price: number;
  /** Umbral % de hit. Default SIGNAL_THRESHOLD_PCT (2%). */
  threshold_pct?: number;
}

export interface ScoredSignal {
  return_pct: number;
  hit: boolean;
}

export function returnPct(initial: number, eval_: number): number {
  if (initial === 0) return 0;
  return ((eval_ - initial) / initial) * 100;
}

export function scoreSignal(input: ScoreSignalInput): ScoredSignal {
  const r = returnPct(input.initial_price, input.eval_price);
  const threshold = input.threshold_pct ?? SIGNAL_THRESHOLD_PCT;
  let hit = false;
  if (input.direccion === 'alcista') hit = r >= threshold;
  else if (input.direccion === 'bajista') hit = r <= -threshold;
  else if (input.direccion === 'neutral') hit = Math.abs(r) < threshold;
  return { return_pct: r, hit };
}

/**
 * Mapea el enum DB `direction_t` (positivo/negativo/neutral, columna
 * `analyses_log.direction`) al vocabulario de scoring (alcista/bajista/neutral).
 * SSOT del mapeo — antes duplicado en el cron `evaluate-signals` (puntúa) y en
 * `/api/metrics/calibration` (agrega): si divergían, la calibración medía con un
 * vocabulario distinto del que se puntuó y los buckets quedaban a n=0.
 */
export function dbToScoringDirection(direction: string): Direction {
  if (direction === 'positivo') return 'alcista';
  if (direction === 'negativo') return 'bajista';
  return 'neutral';
}

/**
 * ATR% del activo desde `a3_output.operativa.atr_actual`, normalizado por el
 * precio inicial. Extracción TOLERANTE (walker, no `A3Output.safeParse`) para que
 * el cron y la calibración lean el ATR con el MISMO criterio — un a3_output legacy
 * que no pasa el parse estricto no debe caer al 2% fijo en un lado y al umbral ATR
 * en el otro. null si no hay ATR usable (runs antiguos, velas insuficientes,
 * precio inválido) → el caller cae a {@link SIGNAL_THRESHOLD_PCT}.
 */
export function extractAtrPct(a3Output: unknown, initialPrice: number): number | null {
  if (!a3Output || typeof a3Output !== 'object' || !Number.isFinite(initialPrice) || initialPrice <= 0) {
    return null;
  }
  const op = (a3Output as { operativa?: { atr_actual?: unknown } }).operativa;
  const atr = op?.atr_actual;
  if (typeof atr !== 'number' || !Number.isFinite(atr) || atr <= 0) return null;
  return (atr / initialPrice) * 100;
}

/**
 * Umbral de hit volatility-adjusted: `max(SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K·ATR%)`.
 * SSOT de la fórmula (antes inline en el cron y en la calibración). `atrPct` null
 * → piso fijo. Así un 2% en BTC (ruido) NO cuenta igual que un 2% en una equity.
 */
export function volatilityThresholdPct(atrPct: number | null): number {
  return atrPct != null ? Math.max(SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K * atrPct) : SIGNAL_THRESHOLD_PCT;
}
