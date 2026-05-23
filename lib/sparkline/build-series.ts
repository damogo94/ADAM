/**
 * Construye una serie de sparkline a partir de los daily candles que
 * devuelve `fallbackDaily()`. Función PURA — recibe los candles y el
 * rango, devuelve `closes[]` recortados.
 *
 * Para 7d devolvemos los últimos 7 closes; para 30d, los últimos 30.
 * El componente UI no necesita timestamps (los puntos están equiespaciados
 * visualmente), así que solo serializamos los precios.
 */

import { RANGE_POINTS, type SparklineRange_t } from './types';

interface DailyCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function buildSeriesCloses(candles: DailyCandle[], range: SparklineRange_t): number[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const points = RANGE_POINTS[range];
  // Yahoo devuelve cronológico ascendente. Tomamos los últimos N.
  return candles
    .slice(-points)
    .map((c) => c.c)
    .filter((n): n is number => Number.isFinite(n));
}
