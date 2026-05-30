/**
 * A.D.A.M. — Indicadores técnicos (compute layer)
 *
 * Refactor Fase 1 · Tarea 1.3
 *
 * Funciones puras y determinísticas que calculan SMA, EMA, VWAP, ATR, RSI
 * y derivados (golden/death cross). Reemplazan a la "matemática" que antes
 * hacía el LLM de A3 (con todas sus alucinaciones).
 *
 * Decisiones de diseño:
 *   - Inputs: arrays de números o velas OHLCV. NUNCA mutamos.
 *   - Outputs: número o null. Null cuando no hay suficientes datos para
 *     calcular (p.ej. SMA200 con sólo 50 velas).
 *   - Usamos `technicalindicators` (npm) para SMA/EMA/ATR/RSI. VWAP es
 *     implementación propia porque la lib lo expone solo intradía con
 *     reset diario, y nosotros queremos rolling sobre la ventana completa.
 *   - NO leen Date.now() — son puras, mismo input → mismo output.
 */

import type { OHLCVCandle_t } from '@/agents/shared/types';
import { SMA, EMA, ATR, RSI, MACD } from 'technicalindicators';

// ───────────────────────────────────────────────────────────────────────────
// Helpers privados
// ───────────────────────────────────────────────────────────────────────────

function closes(candles: OHLCVCandle_t[]): number[] {
  return candles.map((c) => c.c);
}

/** Último valor del array o null si está vacío. */
function last<T>(arr: T[]): T | null {
  return arr.length > 0 ? (arr[arr.length - 1] as T) : null;
}

// ───────────────────────────────────────────────────────────────────────────
// SMA / EMA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Simple Moving Average sobre los closes. Devuelve el ÚLTIMO valor de la
 * SMA, no la serie entera.
 *
 * Si `candles.length < period`, no hay datos suficientes → null.
 */
export function smaLast(candles: OHLCVCandle_t[], period: number): number | null {
  if (candles.length < period) return null;
  const values = SMA.calculate({ period, values: closes(candles) }) as number[];
  return last(values);
}

/**
 * Exponential Moving Average — último valor. Usamos EMA estándar (sin
 * smoothing factor custom). Si necesitamos otro algoritmo (Wilder smoothing,
 * etc.) lo añadimos como parámetro futuro.
 */
export function emaLast(candles: OHLCVCandle_t[], period: number): number | null {
  if (candles.length < period) return null;
  const values = EMA.calculate({ period, values: closes(candles) }) as number[];
  return last(values);
}

// ───────────────────────────────────────────────────────────────────────────
// VWAP (Volume Weighted Average Price)
//
// Implementación propia: VWAP = sum(typical_price × volume) / sum(volume)
// donde typical_price = (H + L + C) / 3.
//
// NOTA: VWAP "puro" se resetea cada sesión (intradía). Aquí calculamos un
// VWAP rolling sobre toda la ventana recibida — útil como ancla técnica
// independiente del timeframe. Si el caller pasa un window=N en el futuro,
// se puede limitar.
// ───────────────────────────────────────────────────────────────────────────

export function vwap(candles: OHLCVCandle_t[]): number | null {
  if (candles.length === 0) return null;
  let numerator = 0;
  let denominator = 0;
  for (const c of candles) {
    const typical = (c.h + c.l + c.c) / 3;
    numerator += typical * c.v;
    denominator += c.v;
  }
  if (denominator === 0) return null; // todo volumen 0: cripto/forex sin volumen
  return numerator / denominator;
}

// ───────────────────────────────────────────────────────────────────────────
// ATR (Average True Range) — para sizing de stops
// ───────────────────────────────────────────────────────────────────────────

/**
 * ATR usando la librería. Período típico 14.
 * Devuelve el último valor, o null si no hay suficientes velas.
 */
export function atrLast(candles: OHLCVCandle_t[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const input = {
    period,
    high: candles.map((c) => c.h),
    low: candles.map((c) => c.l),
    close: candles.map((c) => c.c),
  };
  const values = ATR.calculate(input) as number[];
  return last(values);
}

// ───────────────────────────────────────────────────────────────────────────
// RSI — útil para divergencias, NO como driver principal en A3
// (price action manda — RSI solo es confirmación lateral)
// ───────────────────────────────────────────────────────────────────────────

export function rsiLast(candles: OHLCVCandle_t[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const values = RSI.calculate({ period, values: closes(candles) }) as number[];
  return last(values);
}

// ───────────────────────────────────────────────────────────────────────────
// MACD (Moving Average Convergence Divergence) — momentum + cruces
//
// line = EMA(fast) - EMA(slow) · signal = EMA(line, signalPeriod)
// histograma = line - signal. Cruces line/signal y signo del histograma son
// confirmación de momentum, NUNCA driver principal (price action manda).
// Params estándar 12/26/9. Devuelve null si no hay velas suficientes o si la
// lib aún no produce las tres componentes en la última vela.
// ───────────────────────────────────────────────────────────────────────────

export interface MacdResult {
  line: number;
  signal: number;
  histograma: number;
}

export function macdLast(
  candles: OHLCVCandle_t[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdResult | null {
  if (candles.length < slow + signalPeriod) return null;
  const values = MACD.calculate({
    values: closes(candles),
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const lastItem = last(values);
  if (
    !lastItem ||
    lastItem.MACD === undefined ||
    lastItem.signal === undefined ||
    lastItem.histogram === undefined
  ) {
    return null;
  }
  return { line: lastItem.MACD, signal: lastItem.signal, histograma: lastItem.histogram };
}

// ───────────────────────────────────────────────────────────────────────────
// Golden / Death Cross
//
// Golden Cross: SMA50 cruza ARRIBA de SMA200 (señal alcista de largo plazo).
// Death Cross:  SMA50 cruza ABAJO de SMA200 (señal bajista de largo plazo).
//
// Detección: comparar SMA50[-1] vs SMA200[-1] CON SMA50[-2] vs SMA200[-2].
// Si el signo cambió, hay cruce. Sin lookback (mirar las últimas N velas
// para "cruzó recientemente"), solo cruce en la ÚLTIMA vela.
//
// Decisión: usar lookback de 5 velas. Esto captura cruces "recientes" sin
// inflar la sensibilidad. Configurable por parámetro si hace falta.
// ───────────────────────────────────────────────────────────────────────────

export interface CrossResult {
  golden_cross: boolean;
  death_cross: boolean;
}

export function detectCrosses(
  candles: OHLCVCandle_t[],
  lookbackBars = 5
): CrossResult {
  // Necesitamos al menos 200 + lookback velas para evaluar SMA200
  if (candles.length < 200 + lookbackBars) {
    return { golden_cross: false, death_cross: false };
  }

  const cls = closes(candles);
  const sma50 = SMA.calculate({ period: 50, values: cls }) as number[];
  const sma200 = SMA.calculate({ period: 200, values: cls }) as number[];

  // Alineamos por el final: las series tienen length distinta porque SMA
  // empieza a calcular al período N.
  const minLen = Math.min(sma50.length, sma200.length);
  const sliceStart = Math.max(0, minLen - lookbackBars - 1);
  const sma50Tail = sma50.slice(sma50.length - (minLen - sliceStart));
  const sma200Tail = sma200.slice(sma200.length - (minLen - sliceStart));

  let golden = false;
  let death = false;

  for (let i = 1; i < sma50Tail.length; i++) {
    const prev50 = sma50Tail[i - 1]!;
    const prev200 = sma200Tail[i - 1]!;
    const cur50 = sma50Tail[i]!;
    const cur200 = sma200Tail[i]!;

    // Golden: estaba abajo, ahora está arriba
    if (prev50 <= prev200 && cur50 > cur200) golden = true;
    // Death: estaba arriba, ahora está abajo
    if (prev50 >= prev200 && cur50 < cur200) death = true;
  }

  return { golden_cross: golden, death_cross: death };
}

// ───────────────────────────────────────────────────────────────────────────
// Volumen — clasificación cualitativa
//
// Comparamos volumen reciente (últimas 5 velas) vs media de 20 previas:
//   - > 1.5x → creciente
//   - < 0.5x → decreciente
//   - resto  → estable
//
// Divergencias precio/volumen se calculan en patterns.ts (necesitan trend).
// ───────────────────────────────────────────────────────────────────────────

export function classifyVolumeState(
  candles: OHLCVCandle_t[]
): 'creciente' | 'estable' | 'decreciente' {
  if (candles.length < 25) return 'estable';
  const recent = candles.slice(-5);
  const baseline = candles.slice(-25, -5);
  const recentAvg = recent.reduce((s, c) => s + c.v, 0) / recent.length;
  const baselineAvg = baseline.reduce((s, c) => s + c.v, 0) / baseline.length;
  if (baselineAvg === 0) return 'estable';
  const ratio = recentAvg / baselineAvg;
  if (ratio > 1.5) return 'creciente';
  if (ratio < 0.5) return 'decreciente';
  return 'estable';
}
