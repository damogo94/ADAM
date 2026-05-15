/**
 * Fixtures sintéticos para tests del compute layer.
 *
 * NO usamos OHLCV histórico real porque:
 *   1. No tenemos un dataset versionado en el repo.
 *   2. Datos reales tienen ruido y dificultan verificar matemáticamente.
 *   3. Para snapshot tests, sintético garantiza reproducibilidad bit-exact.
 *
 * Cada fixture es un escenario "limpio" verificable matemáticamente:
 *   - flatPrice: precio constante 100 → SMA todas iguales, ATR pequeño.
 *   - linearUp:  +1 por vela → tendencia alcista clara, fuerza alta.
 *   - linearDown: -1 por vela → tendencia bajista clara.
 *   - sideways: rango 95-105 oscilando → lateral.
 *   - doubleTopShape: dos picos en 110 con valle en 100.
 *   - bullFlag: flagpole +10% + flag lateral 3 sesiones.
 */

import type { OHLCVCandle_t } from '@/agents/shared/types';

/** Helper: genera una vela OHLCV simple a partir de close. */
function candleFromClose(t: number, c: number, vol = 1000): OHLCVCandle_t {
  // OHLC default = open/high/low = close ±0.5%. Suficiente para tests
  // donde lo importante son los closes.
  const wick = c * 0.005;
  return {
    t,
    o: c - wick / 2,
    h: c + wick,
    l: c - wick,
    c,
    v: vol,
  };
}

/** N velas, precio constante. */
export function flatPrice(n: number, price = 100, vol = 1000): OHLCVCandle_t[] {
  return Array.from({ length: n }, (_, i) => candleFromClose(i * 86400, price, vol));
}

/** N velas, sube `step` por vela desde `start`. */
export function linearUp(n: number, start = 100, step = 1, vol = 1000): OHLCVCandle_t[] {
  return Array.from({ length: n }, (_, i) => candleFromClose(i * 86400, start + i * step, vol));
}

/** N velas, baja `step` por vela desde `start`. */
export function linearDown(n: number, start = 200, step = 1, vol = 1000): OHLCVCandle_t[] {
  return Array.from({ length: n }, (_, i) =>
    candleFromClose(i * 86400, start - i * step, vol)
  );
}

/**
 * N velas oscilando en un rango. Útil para tendencia lateral / soporte y
 * resistencia testeables (los extremos del rango se tocan varias veces).
 */
export function sideways(
  n: number,
  low = 95,
  high = 105,
  period = 10,
  vol = 1000
): OHLCVCandle_t[] {
  const mid = (low + high) / 2;
  const amp = (high - low) / 2;
  return Array.from({ length: n }, (_, i) => {
    const phase = (i % period) / period;
    const price = mid + amp * Math.sin(phase * Math.PI * 2);
    return candleFromClose(i * 86400, price, vol);
  });
}

/**
 * Doble techo geométrico: precio sube a 110, baja a 100, sube a 110, baja.
 *
 * IMPORTANTE: cada cima debe ser un único pico (no meseta de 2 velas), porque
 * `findSwingPoints` requiere h_pivot > h_vecinos estricto. Si dos velas
 * consecutivas tienen el mismo h, ninguna es pivot.
 *
 * Estructura: subida 100→110 (11v) · bajada 109→100 (10v) · subida 101→110 (10v) · bajada 109→100 (10v)
 * Total ~41 velas. Las cimas en posiciones 10 y 30; el valle en 20.
 */
export function doubleTopShape(): OHLCVCandle_t[] {
  const result: OHLCVCandle_t[] = [];
  let t = 0;
  // Subida inicial: 100, 101, ..., 110 (11 velas, cima en i=10)
  for (let i = 0; i <= 10; i++) result.push(candleFromClose(t++ * 86400, 100 + i));
  // Bajada al valle: 109, 108, ..., 100 (10 velas, valle en i=20)
  for (let i = 1; i <= 10; i++) result.push(candleFromClose(t++ * 86400, 110 - i));
  // Segunda subida: 101, 102, ..., 110 (10 velas, cima en i=30)
  for (let i = 1; i <= 10; i++) result.push(candleFromClose(t++ * 86400, 100 + i));
  // Bajada final: 109, ..., 100 (10 velas)
  for (let i = 1; i <= 10; i++) result.push(candleFromClose(t++ * 86400, 110 - i));
  return result;
}

/**
 * Bull flag: 5 velas subiendo +10% (flagpole) + 10 velas laterales (flag).
 */
export function bullFlagShape(): OHLCVCandle_t[] {
  const result: OHLCVCandle_t[] = [];
  let t = 0;
  // Flagpole: 100 → 110 en 5 velas
  for (let i = 0; i < 5; i++) result.push(candleFromClose(t++ * 86400, 100 + i * 2));
  // Flag: 10 velas alrededor de 109-111
  const flagPrices = [110, 109.5, 110.5, 109, 110, 110.5, 109.5, 110, 110.2, 110];
  for (const p of flagPrices) result.push(candleFromClose(t++ * 86400, p));
  return result;
}
