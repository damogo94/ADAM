/**
 * A.D.A.M. — Plan de trade derivado de una señal CMT
 *
 * El schema CMT (agents/cmt/schema.ts) NO expone dirección: solo niveles
 * entry/stop/target (+ `entry_type` desde la migración 0019). Para evaluar la
 * señal con `evaluateTrade` (lib/backtest/trade-eval.ts, reutilizado sin tocar)
 * necesitamos derivar un TradePlan. La dirección se infiere de la GEOMETRÍA de
 * los niveles (determinista):
 *
 *   - target > entry && stop < entry → buy  (long: objetivo arriba, stop abajo)
 *   - target < entry && stop > entry → sell (short: objetivo abajo, stop arriba)
 *   - cualquier otra cosa             → null (degenerado / no evaluable)
 *
 * entry_type — NUNCA se asume 'market' (R1, plan de precisión 2026-09):
 * hasta la migración 0019 no se persistía y el backtest asumía 'market',
 * rellenando órdenes límite al precio del nivel el día de emisión y fabricando
 * "wins" fantasma (9 de 11 ganadas CMT). El fallback 'market' "para filas viejas
 * sin dato" sobrevivió al fix y siguió fabricando fills (4 filas NULL→market en
 * producción). Regla actual: un `entry_type` desconocido (null/ausente/otro) NO
 * produce plan → el caller persiste `not_evaluable` (terminal). Solo 'market' o
 * 'limit' explícitos construyen un TradePlan; `evaluateTrade` ya maneja el fill
 * de la orden límite (findIndex del toque + no_fill si nunca dispara).
 *
 * La forma de 3 argumentos existe para los callers que SOLO validan geometría
 * (lib/analyses/trade-summary.ts): devuelve la geometría con dirección inferida
 * y SIN `entry_type` — no hay ningún tipo de entrada implícito que heredar.
 */

import type { TradePlan } from './trade-eval';

export type SignalDirection = 'buy' | 'sell';

/** Geometría validada de una señal: dirección inferida + niveles, sin tipo de entrada. */
export interface SignalGeometry {
  direction: SignalDirection;
  entrada: number;
  stop_loss: number;
  target: number;
}

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

/** true solo para los dos valores que el CHECK de signals_history admite. */
function isKnownEntryType(v: unknown): v is TradePlan['entry_type'] {
  return v === 'market' || v === 'limit';
}

/**
 * Forma de 3 argumentos — SOLO geometría (dirección inferida + niveles), sin
 * `entry_type`. Para callers que validan coherencia de niveles y no evalúan.
 * Devuelve null si la dirección no es inferible.
 */
export function buildSignalTradePlan(entry: number, stop: number, target: number): SignalGeometry | null;
/**
 * Forma de 4 argumentos — TradePlan evaluable. `entryType` debe ser 'market' o
 * 'limit' EXPLÍCITOS; null/undefined/otro → null (el caller persiste
 * `not_evaluable`, terminal, no se reintenta). Nunca degrada a 'market'.
 */
export function buildSignalTradePlan(
  entry: number,
  stop: number,
  target: number,
  entryType: string | null | undefined
): TradePlan | null;
export function buildSignalTradePlan(
  entry: number,
  stop: number,
  target: number,
  ...entryTypeArg: [] | [string | null | undefined]
): SignalGeometry | TradePlan | null {
  const direction = inferSignalDirection(entry, stop, target);
  if (!direction) return null;
  const geometry: SignalGeometry = { direction, entrada: entry, stop_loss: stop, target };

  // Sin 4º argumento → solo geometría (no hay tipo de entrada que asumir).
  if (entryTypeArg.length === 0) return geometry;

  const entryType = entryTypeArg[0];
  if (!isKnownEntryType(entryType)) return null;
  return { ...geometry, entry_type: entryType };
}
