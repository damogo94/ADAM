/**
 * Tests de pct7d — variación a 7 días POR TIMESTAMP (no por conteo de velas).
 *
 * El núcleo del fix: cripto cotiza 7d/semana y equity ~5d/semana, así que
 * "7 velas atrás" daría ventanas distintas. La referencia se busca por
 * timestamp (cierre más cercano a última_vela − 7 días), idéntico para ambos.
 * Histórico insuficiente → null (dato desconocido), nunca 0.
 */

import { describe, it, expect } from 'vitest';
import { pct7d } from '../snapshot';

const D = 86_400; // 1 día en segundos
const c = (close: number, t: number) => ({ o: close, h: close + 1, l: close - 1, c: close, v: 100, t });

describe('pct7d', () => {
  it('cripto: velas diarias continuas → 7d real (7 velas atrás coincide con 7 días)', () => {
    // 8 velas, una por día. Cierre de hace 7 días = 100; actual = 110 → +10%.
    const candles = Array.from({ length: 8 }, (_, i) => c(100 + i, i * D)); // close 100..107
    // última vela t=7D (close 107); target = 7D − 7D = 0 → ref close 100.
    expect(pct7d(candles, 110)).toBeCloseTo(10); // (110-100)/100
  });

  it('equity (cruza finde): usa el cierre de hace 7 días NATURALES, no 7 velas atrás', () => {
    // Dos semanas de sesiones L-V (sin sábado/domingo). Última = viernes sem.2 (t=11D).
    // Por TIMESTAMP, hace 7 días = t=4D (viernes sem.1, close 100).
    // Por CONTEO (7 velas atrás), caería en t=2D (miércoles sem.1, close 90) → resultado distinto.
    const candles = [
      c(80, 0 * D), // Lun s1
      c(85, 1 * D), // Mar
      c(90, 2 * D), // Mié  ← "7 velas atrás" caería aquí (close 90)
      c(95, 3 * D), // Jue
      c(100, 4 * D), // Vie s1 ← objetivo por timestamp (11D−7D=4D), close 100
      c(101, 7 * D), // Lun s2 (sáb/dom 5,6 saltados)
      c(102, 8 * D), // Mar
      c(103, 9 * D), // Mié
      c(104, 10 * D), // Jue
      c(110, 11 * D), // Vie s2 = última
    ];
    // Timestamp → ref close 100 → (110-100)/100 = +10%.
    expect(pct7d(candles, 110)).toBeCloseTo(10);
    // Si fuese por conteo daría (110-90)/90 ≈ +22.2% → comprobamos que NO es eso.
    expect(pct7d(candles, 110)).not.toBeCloseTo(22.22, 1);
  });

  it('histórico insuficiente (<1 semana): la vela más cercana a 7d queda a >2 días → null', () => {
    const candles = [c(100, 0), c(101, 1 * D), c(102, 2 * D)]; // solo 3 días
    expect(pct7d(candles, 102)).toBeNull();
  });

  it('sin velas → null', () => {
    expect(pct7d([], 100)).toBeNull();
  });

  it('sin precio actual → null', () => {
    expect(pct7d([c(100, 0)], null)).toBeNull();
  });

  it('cierre de referencia 0 → null (evita división por cero)', () => {
    const candles = [c(0, 0), c(110, 7 * D)]; // hace 7d el cierre fue 0
    expect(pct7d(candles, 110)).toBeNull();
  });

  it('tolerancia: vela exactamente a 2 días del objetivo todavía computa', () => {
    // última t=9D; target=2D. Vela más cercana a 2D está a 2D justos (en t=0 o t=4D).
    const candles = [c(100, 0), c(120, 4 * D), c(130, 9 * D)];
    // target=2D, candidatos: |0-2|=2D, |4-2|=2D, |9-2|=7D → empata en 2D (toma el primero, t=0, close 100).
    expect(pct7d(candles, 130)).toBeCloseTo(30); // (130-100)/100
  });
});
