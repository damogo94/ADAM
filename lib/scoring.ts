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
