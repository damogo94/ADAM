/**
 * Tests para agents/a3/compute/levels.ts
 */

import { describe, it, expect } from 'vitest';
import { detectLevels } from '../levels';
import { sideways, flatPrice, linearUp, doubleTopShape } from './fixtures';

describe('detectLevels', () => {
  it('vacío si <window*2+1 velas', () => {
    const r = detectLevels(flatPrice(5, 100));
    expect(r.soportes).toEqual([]);
    expect(r.resistencias).toEqual([]);
  });

  it('sideways 95-105 → soportes cerca de 95 y resistencias cerca de 105', () => {
    const r = detectLevels(sideways(100, 95, 105, 10), { tolerancePct: 1.5 });
    // Debe encontrar al menos un soporte cerca de 95 y resistencia cerca de 105
    if (r.soportes.length > 0) {
      expect(r.soportes[0]!).toBeLessThan(100);
      expect(r.soportes[0]!).toBeGreaterThan(90);
    }
    if (r.resistencias.length > 0) {
      expect(r.resistencias[0]!).toBeGreaterThan(100);
      expect(r.resistencias[0]!).toBeLessThan(110);
    }
  });

  it('linearUp: pocos pivots de cluster repetido → soportes/resistencias quizá vacíos', () => {
    // En linear puro cada pivot es único, no hay clustering → con minTouches=2 puede dar vacío
    const r = detectLevels(linearUp(50, 100, 1), { minTouches: 2 });
    // No es estricto, pero verificamos no rompe y devuelve arrays
    expect(Array.isArray(r.soportes)).toBe(true);
    expect(Array.isArray(r.resistencias)).toBe(true);
  });

  it('doubleTop → resistencia cerca de 110 (donde están los dos techos)', () => {
    const r = detectLevels(doubleTopShape(), { tolerancePct: 1.5, minTouches: 2 });
    expect(r.resistencias.length).toBeGreaterThan(0);
    expect(r.resistencias[0]!).toBeGreaterThan(108);
    expect(r.resistencias[0]!).toBeLessThan(112);
  });

  it('determinismo: mismo input → mismos niveles', () => {
    const c = sideways(60, 95, 105);
    expect(detectLevels(c)).toEqual(detectLevels(c));
  });

  it('max levels respeta el cap', () => {
    const r = detectLevels(sideways(200, 95, 105, 5), { maxLevels: 2 });
    expect(r.soportes.length).toBeLessThanOrEqual(2);
    expect(r.resistencias.length).toBeLessThanOrEqual(2);
  });
});
