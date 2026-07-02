/**
 * A.D.A.M. — Gestión operativa (compute layer)
 *
 * Refactor Fase 1 · Tarea 1.3
 *
 * Decide signal (buy/sell/hold) y calcula entrada/stop/target/R-B/horizonte
 * a partir de los outputs de indicators + trend + levels + patterns.
 *
 * Reglas operativas EMBEBIDAS EN CÓDIGO (acuerdo §5 Tarea 1.3):
 *   1. R/B mínimo 1.5:1 → si no se cumple, signal: "hold" + niveles null.
 *   2. Stop al OTRO LADO de un nivel técnico, NO % arbitrario.
 *   3. Target sobre un nivel técnico (resistencia para buy, soporte para sell).
 *   4. Si `ohlcv.length < 20` → signal: "hold", confidence ≤ 30.
 *   5. Si `ohlcv.length < 200` → la SMA200 será null (se hace en indicators.ts).
 *
 * Decisión sobre signal (ADR-002 fase 2 — modelo de PLAN, no "operar ya"):
 *   - alcista + soporte+resistencia presentes + soporte alcanzable → buy
 *   - bajista + resistencia+soporte presentes + resistencia alcanzable → sell
 *   - lateral, falta un nivel, no alcanzable, o R/B < min → hold
 *
 * Entrada (`entry_type`):
 *   - 'market': el precio ya está pegado al nivel (≤ proximity_pct) → entrar ya.
 *   - 'limit':  esperar el retroceso/rebote al nivel (entrada = el propio nivel),
 *     siempre que esté a ≤ REACH_ATR_MULT·ATR (alcanzable dentro del horizonte).
 */

import type {
  OHLCVCandle_t,
  Signal_t,
  TradingHorizon_t,
  TrendDirection_t,
} from '@/agents/shared/types';
import type { LevelsResult } from './levels';
import { roundProfile, type AssetProfile } from '../profiles';

export interface OperativaResult {
  signal: Signal_t;
  entrada: number | null;
  stop_loss: number | null;
  target: number | null;
  atr_actual: number | null;
  ratio_riesgo_beneficio: number | null;
  horizonte: TradingHorizon_t;
  /**
   * Tipo de entrada del plan (ADR-002 fase 2):
   *   - 'market': el precio ya está pegado al nivel → entrar ya.
   *   - 'limit':  esperar el retroceso al nivel (entrada = el propio nivel).
   *   - null:     hold (no hay plan).
   */
  entry_type: 'market' | 'limit' | null;
}

export interface OperativaInput {
  candles: OHLCVCandle_t[];
  tendencia: TrendDirection_t;
  levels: LevelsResult;
  atr: number | null;
  /**
   * Profile derivado del ticker en compute.ts (PR5). Opcional para
   * backward compatibility: sin profile, usa los defaults históricos que
   * coinciden con el `equity` profile (proximity 3%, atr 1%, rb 1.5).
   */
  profile?: AssetProfile;
}

/** R/B mínimo aceptable (default histórico — equity profile lo coincide). */
export const MIN_RB_RATIO = 1.5;
/** Datos insuficientes para emitir setup. */
export const MIN_CANDLES_FOR_SIGNAL = 20;
/** Proximidad al nivel para entrada a MERCADO ("ya está pegado"). */
const DEFAULT_PROXIMITY_PCT = 3;
/** Fallback de ATR como % del precio actual (default histórico). */
const DEFAULT_ATR_FALLBACK_PCT = 1;
/**
 * Alcanzabilidad de un nivel-disparador como múltiplo de ATR (ADR-002 fase 2).
 * Si el nivel está a más de REACH_ATR_MULT·ATR, el retroceso/avance hasta él es
 * fantasía dentro del horizonte → hold. Escala con la volatilidad vía ATR.
 */
export const REACH_ATR_MULT = 5;

export function computeOperativa(input: OperativaInput): OperativaResult {
  const { candles, tendencia, levels, atr, profile } = input;

  // Resolución de parámetros: profile si existe, default histórico si no.
  // Los defaults coinciden con el equity profile → tests existentes pasan.
  const proximityPct = profile?.proximity_pct ?? DEFAULT_PROXIMITY_PCT;
  const atrFallbackPct = profile?.atr_fallback_pct ?? DEFAULT_ATR_FALLBACK_PCT;
  const minRbRatio = profile?.min_rb_ratio ?? MIN_RB_RATIO;
  const round = (n: number) =>
    profile ? roundProfile(n, profile) : Math.round(n * 100) / 100;

  // Cadencia de las velas (≈1 para diario, ≈0.167 para 4H). Sirve para
  // (a) el fallback de horizonte sin target y (b) traducir estBars → estDays
  // en horizonteFromTarget. Se computa una vez (ADR-003, F8b).
  const intervalDays = medianIntervalDays(candles);

  // Regla 4 — datos insuficientes: no hay plan, el horizonte solo puede salir
  // del intervalo de las velas (nunca 'posicional' a ciegas).
  if (candles.length < MIN_CANDLES_FOR_SIGNAL) {
    return {
      signal: 'hold',
      entrada: null,
      stop_loss: null,
      target: null,
      atr_actual: atr,
      ratio_riesgo_beneficio: null,
      horizonte: horizonteFallback(intervalDays),
      entry_type: null,
    };
  }

  const currentPrice = candles[candles.length - 1]!.c;
  const effectiveATR = atr ?? currentPrice * (atrFallbackPct / 100);

  // Caso BUY (alcista): plan largo en el soporte de abajo, target en la
  // resistencia. Entrada a MERCADO si el precio ya está pegado al soporte;
  // si no, LÍMITE en el soporte (esperar el retroceso) siempre que sea
  // alcanzable (≤ REACH_ATR_MULT·ATR). ADR-002 fase 2.
  if (tendencia === 'alcista' && levels.soportes.length > 0 && levels.resistencias.length > 0) {
    const support = levels.soportes[0]!;
    const resistance = levels.resistencias[0]!;
    const distToSupport = currentPrice - support; // soporte abajo → > 0

    if (distToSupport > 0 && resistance > currentPrice) {
      const proximityAbs = currentPrice * (proximityPct / 100);
      const reachAbs = REACH_ATR_MULT * effectiveATR;

      if (distToSupport <= reachAbs) {
        const entry_type: 'market' | 'limit' =
          distToSupport <= proximityAbs ? 'market' : 'limit';
        const entrada = entry_type === 'market' ? currentPrice : support;
        const stop_loss = round(support - effectiveATR);
        const target = round(resistance);
        const riesgo = entrada - stop_loss;
        const beneficio = target - entrada;

        if (riesgo > 0 && beneficio > 0) {
          const ratio = beneficio / riesgo;
          if (ratio >= minRbRatio) {
            return {
              signal: 'buy',
              entrada: round(entrada),
              stop_loss,
              target,
              atr_actual: atr,
              ratio_riesgo_beneficio: round(ratio),
              horizonte: horizonteFromTarget(entrada, target, effectiveATR, intervalDays),
              entry_type,
            };
          }
        }
      }
    }
  }

  // Caso SELL (bajista): plan corto en la resistencia de arriba, target en el
  // soporte. Mercado si el precio ya está pegado; si no, LÍMITE en la
  // resistencia (esperar el rebote) si es alcanzable. ADR-002 fase 2.
  if (tendencia === 'bajista' && levels.resistencias.length > 0 && levels.soportes.length > 0) {
    const resistance = levels.resistencias[0]!;
    const support = levels.soportes[0]!;
    const distToResistance = resistance - currentPrice; // resistencia arriba → > 0

    if (distToResistance > 0 && support < currentPrice) {
      const proximityAbs = currentPrice * (proximityPct / 100);
      const reachAbs = REACH_ATR_MULT * effectiveATR;

      if (distToResistance <= reachAbs) {
        const entry_type: 'market' | 'limit' =
          distToResistance <= proximityAbs ? 'market' : 'limit';
        const entrada = entry_type === 'market' ? currentPrice : resistance;
        const stop_loss = round(resistance + effectiveATR);
        const target = round(support);
        const riesgo = stop_loss - entrada;
        const beneficio = entrada - target;

        if (riesgo > 0 && beneficio > 0) {
          const ratio = beneficio / riesgo;
          if (ratio >= minRbRatio) {
            return {
              signal: 'sell',
              entrada: round(entrada),
              stop_loss,
              target,
              atr_actual: atr,
              ratio_riesgo_beneficio: round(ratio),
              horizonte: horizonteFromTarget(entrada, target, effectiveATR, intervalDays),
              entry_type,
            };
          }
        }
      }
    }
  }

  // Default: HOLD con niveles null (lateral, falta un nivel, R/B insuficiente,
  // o el nivel-disparador no es alcanzable dentro del horizonte). Sin target no
  // hay distancia que medir → horizonte por intervalo de las velas.
  return {
    signal: 'hold',
    entrada: null,
    stop_loss: null,
    target: null,
    atr_actual: atr,
    ratio_riesgo_beneficio: null,
    horizonte: horizonteFallback(intervalDays),
    entry_type: null,
  };
}

/**
 * Horizonte estimado por la DISTANCIA AL TARGET en unidades de ATR (ADR-003,
 * F8b). Reemplaza al viejo `horizonteFromCandles`, que medía el SPAN total de
 * las velas (~1 año en prod) y por eso clavaba TODO en 'posicional'.
 *
 * Modelo (random-walk): el precio no avanza 1 ATR NETO por barra — bajo un
 * paseo aleatorio el desplazamiento neto esperado escala con √barras, así que
 * el tiempo esperado para recorrer K·ATR de distancia escala como ~K² barras
 * (NO lineal). Un modelo lineal (estBars = K) subestima el tiempo porque ignora
 * el vaivén. Por tanto:
 *   K       = |target − entrada| / ATR   (distancia en ATRs)
 *   estBars = K²
 *   estDays = estBars · intervalDays
 *
 * Umbrales alineados a las ventanas del backtest (evaluate-trades: swing=30d,
 * posicional=120d):
 *   estDays < 7   → 'intradia'
 *   7 ≤ estDays < 30 → 'swing'
 *   estDays ≥ 30  → 'posicional'
 *
 * Guard: ATR no positivo/no finito o entrada/target no finitos → no hay
 * distancia fiable que medir; cae al fallback por intervalo.
 */
export function horizonteFromTarget(
  entrada: number,
  target: number,
  atr: number,
  intervalDays: number
): TradingHorizon_t {
  if (
    !Number.isFinite(atr) ||
    atr <= 0 ||
    !Number.isFinite(entrada) ||
    !Number.isFinite(target)
  ) {
    return horizonteFallback(intervalDays);
  }
  const k = Math.abs(target - entrada) / atr;
  const estBars = k ** 2;
  const estDays = estBars * intervalDays;
  if (estDays < 7) return 'intradia';
  if (estDays < 30) return 'swing';
  return 'posicional';
}

/**
 * Fallback de horizonte por INTERVALO de las velas, para el branch HOLD / sin
 * target donde no hay distancia que medir. Default HONESTO: nunca 'posicional'
 * a ciegas (ese era el bug del span total).
 *   intervalDays < 1 (velas intradía, p.ej. 4H) → 'intradia'
 *   resto (gráfico diario o superior)           → 'swing'
 */
export function horizonteFallback(intervalDays: number): TradingHorizon_t {
  return intervalDays < 1 ? 'intradia' : 'swing';
}

/**
 * Cadencia de las velas en días: mediana de Δt entre velas consecutivas / 86400
 * (≈1 para diario, ≈0.167 para 4H). La mediana resiste huecos (fines de semana,
 * festivos) mejor que el span/N. Con < 2 velas asume 1 (diario).
 */
export function medianIntervalDays(candles: OHLCVCandle_t[]): number {
  if (candles.length < 2) return 1;
  const deltas: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    deltas.push(candles[i]!.t - candles[i - 1]!.t);
  }
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const medianSecs =
    deltas.length % 2 === 0 ? (deltas[mid - 1]! + deltas[mid]!) / 2 : deltas[mid]!;
  return medianSecs / 86400;
}
