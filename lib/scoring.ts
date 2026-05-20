/**
 * Scoring de señales — Modo B de backtesting.
 *
 * Reglas v1 (sujetas a revisión cuando tengamos 50+ outcomes):
 *   - alcista  → hit si return_pct >=  +THRESHOLD_PCT
 *   - bajista  → hit si return_pct <=  -THRESHOLD_PCT
 *   - neutral  → hit si |return_pct| <  THRESHOLD_PCT
 *
 * Threshold fijo 2% para v1. Cuando tengamos suficientes outcomes podremos
 * pasar a volatility-adjusted (e.g. múltiplo de ATR).
 */

export const SIGNAL_THRESHOLD_PCT = 2.0;

export type Direction = 'alcista' | 'bajista' | 'neutral';

export interface ScoreSignalInput {
  direccion: Direction;
  initial_price: number;
  eval_price: number;
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
  let hit = false;
  if (input.direccion === 'alcista') hit = r >= SIGNAL_THRESHOLD_PCT;
  else if (input.direccion === 'bajista') hit = r <= -SIGNAL_THRESHOLD_PCT;
  else if (input.direccion === 'neutral') hit = Math.abs(r) < SIGNAL_THRESHOLD_PCT;
  return { return_pct: r, hit };
}
