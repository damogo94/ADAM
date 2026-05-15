/**
 * Tests para agents/a3/compute/trend.ts
 */

import { describe, it, expect } from 'vitest';
import { findSwingPoints, detectTrend } from '../trend';
import { flatPrice, linearUp, linearDown, sideways } from './fixtures';

describe('findSwingPoints', () => {
  it('flat price → cualquier vela tiene vecinos iguales, no hay pivots', () => {
    // Estrictamente: el chequeo es h > vecinos. Con flat los vecinos son iguales,
    // así que isHigh será false. Resultado: 0 pivots.
    const pivots = findSwingPoints(flatPrice(20, 100));
    expect(pivots.length).toBe(0);
  });

  it('detecta pivots claros en una serie con techo definido', () => {
    // Subida → techo → bajada → suelo → subida — con velas que NO se
    // solapan en el borde (la bajada empieza en 108, no 109, para que la
    // cima de 109 sea estrictamente mayor que sus vecinas).
    const candles = [
      ...linearUp(10, 100, 1).map((c, i) => ({ ...c, t: i * 86400 })), // 100..109
      ...linearDown(10, 108, 1).map((c, i) => ({ ...c, t: (10 + i) * 86400 })), // 108..99
      ...linearUp(10, 100, 1).map((c, i) => ({ ...c, t: (20 + i) * 86400 })), // 100..109
    ];
    const pivots = findSwingPoints(candles, 3);
    // Debe haber al menos un pivot HIGH (la cima en la posición ~9)
    expect(pivots.some((p) => p.type === 'high')).toBe(true);
  });

  it('vacío si <2*window+1 velas', () => {
    expect(findSwingPoints(flatPrice(5, 100), 3)).toEqual([]);
  });
});

describe('detectTrend', () => {
  it('linearUp largo → primaria alcista, fuerza alta', () => {
    const t = detectTrend(linearUp(50, 100, 2)); // +2 por vela = +100% total
    expect(t.primaria).toBe('alcista');
    expect(t.fuerza).toBeGreaterThanOrEqual(4);
  });

  it('linearDown largo → primaria bajista', () => {
    const t = detectTrend(linearDown(50, 200, 2));
    expect(t.primaria).toBe('bajista');
    expect(t.fuerza).toBeGreaterThanOrEqual(4);
  });

  it('sideways → fuerza ≤ 2 (lateral o bajista/alcista débil dependiendo de la fase final)', () => {
    // Una onda sinusoidal puede terminar en cualquier fase. Lo que importa
    // es la magnitud: fuerza ≤ 2 garantiza que no se interpreta como tendencia.
    const t = detectTrend(sideways(50, 95, 105, 10));
    expect(t.fuerza).toBeLessThanOrEqual(2);
  });

  it('candles.length < 20 → lateral, fuerza 1', () => {
    const t = detectTrend(flatPrice(10, 100));
    expect(t.primaria).toBe('lateral');
    expect(t.fuerza).toBe(1);
  });

  it('determinismo: mismo input → mismo output', () => {
    const c = linearUp(50, 100, 1);
    expect(detectTrend(c)).toEqual(detectTrend(c));
  });
});
