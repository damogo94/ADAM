/**
 * A.D.A.M. — `computeTechnical()` — orquestador del compute layer de A3
 *
 * Refactor Fase 1 · Tarea 1.3
 *
 * Reemplaza la "matemática" que antes hacía el LLM de A3 por código
 * determinístico. Devuelve TODO el A3Output excepto `narrative`, que será
 * rellenado por `narrateA3()` (Tarea 1.3 narrate.ts, no incluida aquí).
 *
 * Garantías:
 *   - **Determinismo total**: mismo input → mismo output, bit a bit.
 *   - **Cero LLM**: ninguna llamada externa, ningún reasoning.
 *   - **Salida valida contra `A3Output.omit({narrative: true}).strict()`**.
 *
 * Reglas operativas embebidas (acuerdo §5):
 *   - R/B mínimo 1.5:1 (en operative.ts)
 *   - Si `candles.length < 20` → signal hold, confidence ≤ 30
 *   - Si `candles.length < 200` → sma200 null
 *   - Stop al otro lado de nivel técnico (en operative.ts)
 *
 * Confidence (0-100): heurística determinística basada en:
 *   - Datos suficientes (≥50 velas = +20)
 *   - Tendencia clara (no lateral = +15)
 *   - Niveles bien definidos (soporte+resistencia = +15)
 *   - Patrón detectado (= +15)
 *   - Volumen confirma (creciente o estable = +15)
 *   - Operativa con R/B claro (signal != hold = +20)
 *   Total max = 100, partiendo de base 0.
 */

import {
  smaLast,
  vwap,
  atrLast,
  detectCrosses,
  classifyVolumeState,
} from './compute/indicators';
import { detectTrend } from './compute/trend';
import { detectLevels } from './compute/levels';
import {
  detectPattern,
  detectRelevantCandles,
  detectVolumeDivergence,
} from './compute/patterns';
import { computeOperativa } from './compute/operative';
import { analyzeMtf, mtfConfidenceDelta } from './compute/mtf';
import { profileFor } from './profiles';
import type {
  A3Output_t,
  OHLCVCandle_t,
  Timeframe_t,
} from '@/agents/shared/types';

export interface ComputeTechnicalInput {
  ticker: string;
  ohlcv: OHLCVCandle_t[];
  /** Identificador del timeframe del array OHLCV. */
  timeframe: Timeframe_t;
  /**
   * Velas intradía hourly opcionales. Si presentes con ≥24 velas, se agregan
   * a 4H y se computa multi-timeframe alignment. Si null o insuficientes,
   * mtf en la salida es null y no hay penalización ni boost de confidence.
   */
  intraday?: OHLCVCandle_t[];
}

/** Salida de computeTechnical = A3Output sin `narrative` (lo añade el LLM). */
export type ComputeTechnicalOutput = Omit<A3Output_t, 'narrative'>;

export function computeTechnical(
  input: ComputeTechnicalInput
): ComputeTechnicalOutput {
  const { ticker, ohlcv, timeframe, intraday } = input;

  // ── Indicadores ──────────────────────────────────────────────────
  const sma20 = smaLast(ohlcv, 20);
  const sma50 = smaLast(ohlcv, 50);
  const sma200 = smaLast(ohlcv, 200); // null si <200 velas
  const vwapVal = vwap(ohlcv);
  const atr = atrLast(ohlcv, 14);
  const { golden_cross, death_cross } = detectCrosses(ohlcv);

  // ── Tendencia ────────────────────────────────────────────────────
  const trend = detectTrend(ohlcv);

  // ── Niveles ──────────────────────────────────────────────────────
  const levels = detectLevels(ohlcv);

  // ── Patrón + velas relevantes ────────────────────────────────────
  const { patron_detectado } = detectPattern(ohlcv);
  const velas_relevantes = detectRelevantCandles(ohlcv);

  // ── Volumen ──────────────────────────────────────────────────────
  // Prioridad: divergencia explícita > clasificación cuantitativa
  const volumeDiv = detectVolumeDivergence(ohlcv);
  const volumeState = volumeDiv ?? classifyVolumeState(ohlcv);
  const volumeComment = describeVolume(volumeState, ohlcv);

  // ── Operativa ────────────────────────────────────────────────────
  // PR5: profile derivado del ticker parametriza proximity/ATR/RB por
  // clase de activo. No entra al LLM (no rompe aislamiento de A3) — solo
  // ajusta las magnitudes del compute determinístico.
  const profile = profileFor(ticker);
  const operativa = computeOperativa({
    candles: ohlcv,
    tendencia: trend.primaria,
    levels,
    atr,
    profile,
  });

  // ── Multi-timeframe (opcional, solo si hay intraday suficiente) ──
  const mtf = analyzeMtf(trend.primaria, intraday);

  // ── Confidence (heurística determinística + ajuste MTF) ──────────
  const baseConfidence = computeConfidence({
    candleCount: ohlcv.length,
    trend: trend.primaria,
    hasLevels: levels.soportes.length > 0 && levels.resistencias.length > 0,
    hasPattern: patron_detectado !== null,
    volumeOk: volumeState === 'creciente' || volumeState === 'estable',
    operativaActive: operativa.signal !== 'hold',
  });
  const mtfDelta = mtf ? mtfConfidenceDelta(mtf.alignment) : 0;
  const confidence = Math.max(0, Math.min(100, baseConfidence + mtfDelta));

  // ── Factor invalidación (texto determinístico) ───────────────────
  const factor_invalidacion = describeInvalidation(operativa, levels, trend.primaria);

  // ── Output ───────────────────────────────────────────────────────
  return {
    ticker,
    timeframes_analizados: mtf ? [timeframe, '4H'] : [timeframe],
    tendencia: trend,
    soportes: levels.soportes,
    resistencias: levels.resistencias,
    patron_detectado,
    medias: {
      sma20,
      sma50,
      sma200,
      vwap: vwapVal,
      golden_cross,
      death_cross,
    },
    volumen: {
      estado: volumeState,
      comentario: volumeComment,
    },
    velas_relevantes,
    operativa,
    factor_invalidacion,
    mtf,
    confidence,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers — confidence + textos descriptivos
// ───────────────────────────────────────────────────────────────────────────

function computeConfidence(input: {
  candleCount: number;
  trend: 'alcista' | 'bajista' | 'lateral';
  hasLevels: boolean;
  hasPattern: boolean;
  volumeOk: boolean;
  operativaActive: boolean;
}): number {
  // Edge case: datos insuficientes → cap a 30
  if (input.candleCount < 20) return Math.min(30, 10);

  let score = 0;
  if (input.candleCount >= 50) score += 20;
  else if (input.candleCount >= 30) score += 10;

  if (input.trend !== 'lateral') score += 15;
  if (input.hasLevels) score += 15;
  if (input.hasPattern) score += 15;
  if (input.volumeOk) score += 15;
  if (input.operativaActive) score += 20;

  return Math.min(100, Math.max(0, score));
}

function describeVolume(
  state:
    | 'creciente'
    | 'estable'
    | 'decreciente'
    | 'divergencia_alcista'
    | 'divergencia_bajista',
  candles: OHLCVCandle_t[]
): string {
  const recent = candles.slice(-5);
  const avgVol = recent.reduce((s, c) => s + c.v, 0) / Math.max(1, recent.length);
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  switch (state) {
    case 'creciente':
      return `Volumen reciente promedio ${fmt(avgVol)}, por encima del promedio de 20 sesiones (>1.5x).`;
    case 'decreciente':
      return `Volumen reciente promedio ${fmt(avgVol)}, por debajo del promedio de 20 sesiones (<0.5x).`;
    case 'divergencia_alcista':
      return `Precio descendente con volumen decreciente — divergencia alcista (agotamiento bajista).`;
    case 'divergencia_bajista':
      return `Precio ascendente con volumen decreciente — divergencia bajista (agotamiento alcista).`;
    case 'estable':
    default:
      return `Volumen reciente promedio ${fmt(avgVol)}, en línea con el promedio de 20 sesiones.`;
  }
}

function describeInvalidation(
  operativa: ReturnType<typeof computeOperativa>,
  levels: ReturnType<typeof detectLevels>,
  trend: 'alcista' | 'bajista' | 'lateral'
): string {
  if (operativa.signal === 'buy' && operativa.stop_loss !== null) {
    return `Cierre diario por debajo de ${operativa.stop_loss} invalida la tesis alcista y activa stop.`;
  }
  if (operativa.signal === 'sell' && operativa.stop_loss !== null) {
    return `Cierre diario por encima de ${operativa.stop_loss} invalida la tesis bajista y activa stop.`;
  }
  // Hold — describe el factor que cambiaría el sesgo si lo hay
  if (trend === 'alcista' && levels.soportes.length > 0) {
    return `Pérdida del soporte ${levels.soportes[0]} con volumen >1.5x promedio invalidaría la tendencia alcista de fondo.`;
  }
  if (trend === 'bajista' && levels.resistencias.length > 0) {
    return `Ruptura de la resistencia ${levels.resistencias[0]} con volumen >1.5x promedio invalidaría la tendencia bajista de fondo.`;
  }
  return 'Sin trigger técnico inmediato. Esperar definición de estructura para reevaluar.';
}
