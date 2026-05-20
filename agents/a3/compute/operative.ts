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
 * Decisión sobre signal:
 *   - tendencia primaria alcista + precio cerca de soporte → buy
 *   - tendencia primaria bajista + precio cerca de resistencia → sell
 *   - tendencia lateral o falta de nivel cercano → hold
 *
 * "Cerca de" = dentro del primer 3% sobre el nivel relevante. Esto refleja
 * la idea de "entrar en el rebote", no "entrar a mitad del movimiento".
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
/** Proximidad al nivel para considerar "entrada limpia" (default histórico). */
const DEFAULT_PROXIMITY_PCT = 3;
/** Fallback de ATR como % del precio actual (default histórico). */
const DEFAULT_ATR_FALLBACK_PCT = 1;

export function computeOperativa(input: OperativaInput): OperativaResult {
  const { candles, tendencia, levels, atr, profile } = input;

  // Resolución de parámetros: profile si existe, default histórico si no.
  // Los defaults coinciden con el equity profile → tests existentes pasan.
  const proximityPct = profile?.proximity_pct ?? DEFAULT_PROXIMITY_PCT;
  const atrFallbackPct = profile?.atr_fallback_pct ?? DEFAULT_ATR_FALLBACK_PCT;
  const minRbRatio = profile?.min_rb_ratio ?? MIN_RB_RATIO;
  const round = (n: number) =>
    profile ? roundProfile(n, profile) : Math.round(n * 100) / 100;

  const fallbackHorizonte: TradingHorizon_t = horizonteFromCandles(candles);

  // Regla 4 — datos insuficientes
  if (candles.length < MIN_CANDLES_FOR_SIGNAL) {
    return {
      signal: 'hold',
      entrada: null,
      stop_loss: null,
      target: null,
      atr_actual: atr,
      ratio_riesgo_beneficio: null,
      horizonte: fallbackHorizonte,
    };
  }

  const currentPrice = candles[candles.length - 1]!.c;

  // Caso BUY: tendencia alcista + precio cerca de un soporte ABAJO
  if (tendencia === 'alcista' && levels.soportes.length > 0 && levels.resistencias.length > 0) {
    const nearestSupport = levels.soportes[0]!; // ya ordenado por relevancia + cercanía
    const nearestResistance = levels.resistencias[0]!;
    const proximityToSupport = ((currentPrice - nearestSupport) / currentPrice) * 100;

    // "Cerca" = dentro del proximityPct sobre el soporte (por profile)
    if (proximityToSupport >= 0 && proximityToSupport <= proximityPct) {
      const entrada = currentPrice;
      const stop_loss = round(nearestSupport - (atr ?? currentPrice * (atrFallbackPct / 100)));
      const target = round(nearestResistance);
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
            horizonte: fallbackHorizonte,
          };
        }
      }
    }
  }

  // Caso SELL: tendencia bajista + precio cerca de una resistencia ARRIBA
  if (tendencia === 'bajista' && levels.resistencias.length > 0 && levels.soportes.length > 0) {
    const nearestResistance = levels.resistencias[0]!;
    const nearestSupport = levels.soportes[0]!;
    const proximityToResistance = ((nearestResistance - currentPrice) / currentPrice) * 100;

    if (proximityToResistance >= 0 && proximityToResistance <= proximityPct) {
      const entrada = currentPrice;
      const stop_loss = round(nearestResistance + (atr ?? currentPrice * (atrFallbackPct / 100)));
      const target = round(nearestSupport);
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
            horizonte: fallbackHorizonte,
          };
        }
      }
    }
  }

  // Default: HOLD con niveles null (R/B no cumple, o lateral, o no hay
  // proximidad a un nivel técnico)
  return {
    signal: 'hold',
    entrada: null,
    stop_loss: null,
    target: null,
    atr_actual: atr,
    ratio_riesgo_beneficio: null,
    horizonte: fallbackHorizonte,
  };
}

/**
 * Heurística de horizonte basada en el rango temporal cubierto por las
 * velas. Es aproximada — el caller debería preferir pasar el timeframe
 * explícito si lo tiene. Aquí inferimos:
 *   - Si las velas cubren < 7 días reales → intradía
 *   - Si cubren 7-90 días → swing
 *   - Si cubren > 90 días → posicional
 */
function horizonteFromCandles(candles: OHLCVCandle_t[]): TradingHorizon_t {
  if (candles.length < 2) return 'swing';
  const first = candles[0]!.t;
  const last = candles[candles.length - 1]!.t;
  const spanDays = (last - first) / 86400;
  if (spanDays < 7) return 'intradia';
  if (spanDays < 90) return 'swing';
  return 'posicional';
}
