/**
 * A.D.A.M. — Evaluación path-dependent de operativas (ADR-002 fase 3)
 *
 * Mide el RESULTADO REAL de la operativa de A3 (entrada/stop/target), no un
 * drift genérico: dentro de la ventana del horizonte, ¿qué se toca primero?
 *
 *   - target antes que stop  → win  (sale en target)
 *   - stop antes que target  → loss (sale en stop)
 *   - ninguno al vencer       → timeout (sale al close final)
 *   - entrada límite que nunca dispara → no_fill (la orden no se ejecutó)
 *
 * Función PURA y determinista: NO lee Date.now() ni la red. El caller (cron)
 * filtra las velas a la ventana [inicio, min(hoy, inicio+ventana)] y pasa
 * `windowElapsed` (si la ventana ya venció). Mientras no haya barrera tocada
 * ni la ventana vencida, el resultado es `pending` (re-evaluar mañana).
 *
 * Ambigüedad de misma vela: si una vela diaria toca stop Y target, con datos
 * diarios no se sabe el orden → se asume STOP primero (conservador: no infla
 * el win-rate). Esto pasa a velas más finas (4H) en fase 4.
 */

export type TradeOutcome = 'win' | 'loss' | 'timeout' | 'no_fill' | 'not_evaluable';

export interface TradePlan {
  direction: 'buy' | 'sell';
  entry_type: 'market' | 'limit';
  entrada: number;
  stop_loss: number;
  target: number;
}

/** Vela mínima necesaria para la evaluación (OHLC; el volumen no se usa). */
export interface EvalCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface TradeEvalResult {
  /** 'resolved' → outcome definitivo · 'pending' → aún abierta, reintentar. */
  status: 'resolved' | 'pending';
  outcome: TradeOutcome | null;
  /** Precio de salida (target/stop/close), o null si no_fill/pending/not_evaluable. */
  exit_price: number | null;
  /** Retorno % sobre la posición (ajustado por dirección). */
  return_pct: number | null;
  /** Resultado en múltiplos de riesgo inicial: win≈+R/B, loss=-1, timeout=parcial. */
  r_multiple: number | null;
  /** Índice de la vela donde se resolvió (relativo al array recibido). */
  resolved_index: number | null;
}

const PENDING: TradeEvalResult = {
  status: 'pending',
  outcome: null,
  exit_price: null,
  return_pct: null,
  r_multiple: null,
  resolved_index: null,
};

function unresolved(outcome: TradeOutcome): TradeEvalResult {
  return { status: 'resolved', outcome, exit_price: null, return_pct: null, r_multiple: null, resolved_index: null };
}

/**
 * Evalúa una operativa contra las velas disponibles.
 *
 * @param plan      entrada/stop/target + dirección + tipo de entrada.
 * @param candles   velas ORDENADAS desde el inicio del análisis hasta
 *                  min(hoy, inicio+ventana). Pueden ser diarias (swing/posicional)
 *                  o 4H (intradía, fase 4) — la lógica es agnóstica al timeframe.
 * @param opts.windowElapsed  true si la ventana del horizonte ya venció.
 */
export function evaluateTrade(
  plan: TradePlan,
  candles: EvalCandle[],
  opts: { windowElapsed: boolean }
): TradeEvalResult {
  const { direction, entry_type, entrada, stop_loss, target } = plan;

  if (candles.length === 0) return unresolved('not_evaluable');

  const risk = Math.abs(entrada - stop_loss);
  if (risk <= 0) return unresolved('not_evaluable'); // plan degenerado

  // ── 1. Disparo de la entrada ────────────────────────────────────
  let fillIdx = 0;
  if (entry_type === 'limit') {
    fillIdx = candles.findIndex((c) =>
      direction === 'buy' ? c.l <= entrada : c.h >= entrada
    );
    if (fillIdx === -1) {
      // Nunca tocó el nivel de entrada. Solo es 'no_fill' definitivo cuando
      // la ventana venció; si no, sigue pudiendo dispararse → pending.
      return opts.windowElapsed ? unresolved('no_fill') : PENDING;
    }
  }

  // ── 2. Carrera stop vs target desde el fill ─────────────────────
  for (let i = fillIdx; i < candles.length; i++) {
    const c = candles[i]!;
    const hitStop = direction === 'buy' ? c.l <= stop_loss : c.h >= stop_loss;
    const hitTarget = direction === 'buy' ? c.h >= target : c.l <= target;
    // Conservador: si la misma vela toca ambos, contamos STOP primero.
    if (hitStop) return resolve(plan, stop_loss, 'loss', i, risk);
    if (hitTarget) return resolve(plan, target, 'win', i, risk);
  }

  // ── 3. Sin barrera tocada ────────────────────────────────────────
  if (opts.windowElapsed) {
    const lastClose = candles[candles.length - 1]!.c;
    return resolve(plan, lastClose, 'timeout', candles.length - 1, risk);
  }
  return PENDING;
}

function resolve(
  plan: TradePlan,
  exit: number,
  outcome: 'win' | 'loss' | 'timeout',
  index: number,
  risk: number
): TradeEvalResult {
  // profit ajustado por dirección (buy: sube = ganancia · sell: baja = ganancia).
  const profit = plan.direction === 'buy' ? exit - plan.entrada : plan.entrada - exit;
  return {
    status: 'resolved',
    outcome,
    exit_price: exit,
    return_pct: (profit / plan.entrada) * 100,
    r_multiple: profit / risk,
    resolved_index: index,
  };
}
