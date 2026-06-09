/**
 * A.D.A.M. — Plan de trade derivado de una señal CMT
 *
 * El schema CMT (agents/cmt/schema.ts) NO expone dirección ni tipo de entrada:
 * solo niveles entry/stop/target. Para evaluar la señal con `evaluateTrade`
 * (lib/backtest/trade-eval.ts, reutilizado sin tocar) necesitamos derivar un
 * TradePlan. La dirección se infiere de la GEOMETRÍA de los niveles (determinista):
 *
 *   - target > entry && stop < entry → buy  (long: objetivo arriba, stop abajo)
 *   - target < entry && stop > entry → sell (short: objetivo abajo, stop arriba)
 *   - cualquier otra cosa             → null (degenerado / no evaluable)
 *
 * entry_type es siempre 'market': CMT no distingue limit vs stop-entry, así que
 * asumimos entrada al `entry` en la emisión (mide la pregunta honesta: si tomaste
 * la señal tal cual, ¿tocó antes target o stop?). Documentado en el cron.
 */

import type { TradePlan } from './trade-eval';

export type SignalDirection = 'buy' | 'sell';

/**
 * Infiere la dirección de la señal desde la geometría de niveles.
 * Devuelve null si la geometría es degenerada (niveles al mismo lado, o algún
 * nivel coincide con la entrada → riesgo/recorrido nulo).
 */
export function inferSignalDirection(
  entry: number,
  stop: number,
  target: number
): SignalDirection | null {
  if (target > entry && stop < entry) return 'buy';
  if (target < entry && stop > entry) return 'sell';
  return null;
}

/**
 * Construye el TradePlan ('market') a partir de los niveles de la señal.
 * Devuelve null si la dirección no es inferible → el caller persiste
 * outcome 'not_evaluable' (resuelto, no se reintenta).
 */
export function buildSignalTradePlan(
  entry: number,
  stop: number,
  target: number
): TradePlan | null {
  const direction = inferSignalDirection(entry, stop, target);
  if (!direction) return null;
  return { direction, entry_type: 'market', entrada: entry, stop_loss: stop, target };
}
