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
 * entry_type: la señal SÍ lo distingue (el compute genera short en la resistencia
 * / long en el soporte → 'limit'), pero hasta la migración 0019 no se persistía y
 * se asumía 'market' — inflando el backtest (una orden límite no rellenada se
 * contaba como fill a mercado). Ahora se pasa explícito; se mantiene 'market' como
 * fallback SOLO para filas viejas sin dato recuperable. `evaluateTrade` ya maneja
 * el fill de la orden límite (findIndex del toque + no_fill si nunca dispara).
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
 * Construye el TradePlan a partir de los niveles de la señal + su `entry_type`.
 * `entryType` null/ausente → fallback 'market' (filas viejas sin dato: migración
 * 0019 backfilea desde `setup_detected`, pero algunas pueden quedar sin recuperar).
 * Devuelve null si la dirección no es inferible → el caller persiste outcome
 * 'not_evaluable' (resuelto, no se reintenta).
 */
export function buildSignalTradePlan(
  entry: number,
  stop: number,
  target: number,
  entryType?: string | null
): TradePlan | null {
  const direction = inferSignalDirection(entry, stop, target);
  if (!direction) return null;
  return {
    direction,
    entry_type: entryType === 'limit' ? 'limit' : 'market',
    entrada: entry,
    stop_loss: stop,
    target,
  };
}
