/**
 * A.D.A.M. — Detección de tendencia (compute layer)
 *
 * Refactor Fase 1 · Tarea 1.3
 *
 * Detecta tendencia primaria y secundaria por estructura de máximos y
 * mínimos (HH/HL alcista, LH/LL bajista). NO usa medias móviles para esto
 * — las medias son lag indicators; nosotros queremos LA ESTRUCTURA del
 * precio, que es el lenguaje que A3 narra.
 *
 * Algoritmo:
 *   1. Identificar swing points (pivots) usando ventana ±N velas.
 *   2. Tomar los últimos K pivots máximos y K pivots mínimos.
 *   3. Si máximos crecientes Y mínimos crecientes → alcista.
 *   4. Si máximos decrecientes Y mínimos decrecientes → bajista.
 *   5. Resto → lateral.
 *
 * Fuerza (1-5):
 *   - Magnitud del cambio entre pivots (avg % cambio entre swings).
 *   - Mapeo a escala 1-5 con thresholds calibrados.
 */

import type { OHLCVCandle_t, TrendDirection_t } from '@/agents/shared/types';

export interface SwingPoint {
  /** Índice en el array de candles. */
  index: number;
  /** Precio del pivot (high para max, low para min). */
  price: number;
  /** Tipo de pivot. */
  type: 'high' | 'low';
}

/**
 * Detecta swing points en la serie. Un pivot HIGH es una vela cuyo `h` es
 * el mayor de las `window` velas a izquierda y derecha. Análogo para LOW.
 *
 * `window` típico: 3-5 para 1H, 5-10 para 1D. Default 3 para sensibilidad
 * razonable en cualquier timeframe.
 *
 * Las velas en los extremos (sin suficiente contexto a un lado) NO son
 * pivots — lo correcto es esperar a que se "confirmen".
 */
export function findSwingPoints(
  candles: OHLCVCandle_t[],
  window = 3
): SwingPoint[] {
  const pivots: SwingPoint[] = [];
  if (candles.length < window * 2 + 1) return pivots;

  for (let i = window; i < candles.length - window; i++) {
    const center = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      const neighbor = candles[j]!;
      if (neighbor.h >= center.h) isHigh = false;
      if (neighbor.l <= center.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, price: center.h, type: 'high' });
    if (isLow) pivots.push({ index: i, price: center.l, type: 'low' });
  }
  return pivots;
}

export interface TrendResult {
  primaria: TrendDirection_t;
  secundaria: TrendDirection_t;
  fuerza: 1 | 2 | 3 | 4 | 5;
}

/**
 * Ventanas recientes FIJAS para `fuerza` y `secundaria`. Antes `fuerza` barría
 * la serie COMPLETA y `secundaria` el `length/3`, así que su valor dependía de
 * cuántas velas recibía detectTrend. Tras ampliar el path vivo a '1y' (~252
 * velas) eso saturaba `fuerza` a 5 para casi cualquier activo (un movimiento
 * >30% en un año es lo normal) y alargaba `secundaria` a ~84 sesiones. Las
 * acotamos a ventanas recientes fijas → length-invariant y horizontes
 * coherentes (secundaria ⊂ fuerza). `primaria` NO se toca: ya es invariante
 * (usa los últimos 2 swings) y la consume Estructura directamente.
 *
 * Tunables: 60 ≈ 3 meses (magnitud), 40 ≈ 2 meses (sub-tendencia reciente).
 */
const FUERZA_WINDOW = 60;
const SECONDARY_WINDOW = 40;

/**
 * Detecta tendencia primaria sobre la estructura reciente (últimos swings, o
 * % de closes como fallback) y secundaria sobre una ventana reciente fija.
 * `fuerza` mide la magnitud del movimiento sobre una ventana reciente fija.
 * Captura "tendencia de fondo vs movimiento reciente" sin que el resultado
 * dependa de cuántas velas se pasen (ver FUERZA_WINDOW / SECONDARY_WINDOW).
 */
export function detectTrend(candles: OHLCVCandle_t[]): TrendResult {
  if (candles.length < 20) {
    return { primaria: 'lateral', secundaria: 'lateral', fuerza: 1 };
  }

  const primaria =
    classifyTrend(findSwingPoints(candles)) ?? classifyByCloses(candles);

  // Secundaria: ventana reciente FIJA (antes length/3, que crecía con la serie).
  const secTail = candles.slice(-SECONDARY_WINDOW);
  const secundaria =
    classifyTrend(findSwingPoints(secTail)) ?? classifyByCloses(secTail);

  // Fuerza: magnitud del cambio direccional sobre una ventana reciente FIJA
  // (antes toda la serie, que con '1y' saturaba a 5). % cambio close[-W] vs close[-1].
  const fuerzaTail = candles.slice(-FUERZA_WINDOW);
  const first = fuerzaTail[0]!.c;
  const last = fuerzaTail[fuerzaTail.length - 1]!.c;
  const changePct = Math.abs(((last - first) / first) * 100);

  let fuerza: 1 | 2 | 3 | 4 | 5 = 1;
  if (changePct > 30) fuerza = 5;
  else if (changePct > 15) fuerza = 4;
  else if (changePct > 7) fuerza = 3;
  else if (changePct > 3) fuerza = 2;

  // Si la primaria es lateral, fuerza ≤ 2 (no tiene sentido lateral con fuerza 5)
  if (primaria === 'lateral' && fuerza > 2) fuerza = 2;

  return { primaria, secundaria, fuerza };
}

/**
 * Dado un set de swings, clasifica la tendencia mirando los últimos 2
 * highs y 2 lows. Si no hay suficientes pivots, devuelve `null` para que
 * el caller decida usar fallback (closes monotónicos).
 *
 * Devuelve `null` en lugar de 'lateral' para distinguir "estructura
 * insuficiente" (sin pivots) de "estructura sin tendencia" (pivots sin
 * HH/HL claros).
 */
function classifyTrend(swings: SwingPoint[]): TrendDirection_t | null {
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');

  if (highs.length < 2 || lows.length < 2) return null;

  const lastHigh = highs[highs.length - 1]!.price;
  const prevHigh = highs[highs.length - 2]!.price;
  const lastLow = lows[lows.length - 1]!.price;
  const prevLow = lows[lows.length - 2]!.price;

  const higherHighs = lastHigh > prevHigh;
  const higherLows = lastLow > prevLow;
  const lowerHighs = lastHigh < prevHigh;
  const lowerLows = lastLow < prevLow;

  if (higherHighs && higherLows) return 'alcista';
  if (lowerHighs && lowerLows) return 'bajista';
  return 'lateral';
}

/**
 * Fallback: clasificación por cambio porcentual de closes.
 * Útil para series monotónicas (linear up/down) donde NO hay pivots
 * locales — toda vela tiene un vecino mayor a un lado.
 *
 * Threshold ±2% sobre la ventana completa. Más allá: tendencia clara.
 * Menos: lateral.
 */
function classifyByCloses(candles: OHLCVCandle_t[]): TrendDirection_t {
  if (candles.length < 2) return 'lateral';
  const first = candles[0]!.c;
  const last = candles[candles.length - 1]!.c;
  const changePct = ((last - first) / first) * 100;
  if (changePct > 2) return 'alcista';
  if (changePct < -2) return 'bajista';
  return 'lateral';
}
