/**
 * Fixtures deterministas para los tests del Agente de Estructura.
 *
 * `seriesFromPivots` interpola linealmente entre una lista de extremos
 * (trough/peak alternados) creando velas cuyos pivots son detectables por
 * `findSwingPoints` (window ≤ 4). El último valor de `pivots` queda como
 * precio actual; el penúltimo extremo SÍ se confirma como swing (tiene velas
 * a ambos lados).
 */

import type { OHLCVCandle_t } from '@/agents/shared/types';

const BASE_T = 1_700_000_000; // epoch fijo (segundos) — determinismo

function candle(i: number, c: number): OHLCVCandle_t {
  return {
    t: BASE_T + i * 86_400,
    o: c,
    h: c * 1.002,
    l: c * 0.998,
    c,
    v: 1000,
  };
}

/**
 * Construye una serie de velas interpolando entre `pivots`. Cada tramo usa
 * `gap` velas; el último pivot se añade como cierre final (precio actual).
 */
export function seriesFromPivots(pivots: number[], gap = 6): OHLCVCandle_t[] {
  const closes: number[] = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    const a = pivots[i]!;
    const b = pivots[i + 1]!;
    for (let k = 0; k < gap; k++) {
      closes.push(a + (b - a) * (k / gap));
    }
  }
  closes.push(pivots[pivots.length - 1]!);
  return closes.map((c, idx) => candle(idx, c));
}

/**
 * Tendencia alcista con retroceso a la zona del penúltimo alto.
 * highs: 112,126,140,162 (HH) · lows: 106,118,128,140 (HL) · precio ≈ 141.
 * → penúltimo_alto = 140 (zona de compra), último_alto = 162.
 */
export const ALCISTA_EN_ZONA = seriesFromPivots([
  100, 112, 106, 126, 118, 140, 128, 162, 140, 141,
]);

/**
 * Tendencia bajista con retroceso a la zona del penúltimo bajo.
 * lows: 88,74,60,40 (LL) · highs: 94,82,70,56 (LH) · precio ≈ 60.
 * → penúltimo_bajo = 60 (zona de venta), último_bajo = 40.
 */
export const BAJISTA_EN_ZONA = seriesFromPivots([
  100, 88, 94, 74, 82, 60, 70, 40, 56, 60,
]);

/**
 * Doble suelo (W) — para gatillo de compra. gap=8 → ≥30 velas (mínimo de
 * `detectPattern`).
 */
export const DOBLE_SUELO = seriesFromPivots([140, 100, 120, 100.5, 130], 8);

/** Doble techo (M) — para gatillo de venta. */
export const DOBLE_TECHO = seriesFromPivots([60, 100, 80, 100.5, 70], 8);
