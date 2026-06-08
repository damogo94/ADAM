/**
 * Tests del reloj 2 de frescura (QW2): drift de precio desde el veredicto.
 */

import { describe, it, expect } from 'vitest';
import { computePriceDrift, priceMoved, PRICE_DRIFT_THRESHOLD_PCT } from '../compute-freshness';

describe('computePriceDrift', () => {
  it('precio subió desde el veredicto → drift positivo', () => {
    expect(computePriceDrift({ initial_price: 100 }, 103)).toBeCloseTo(3);
  });

  it('precio bajó desde el veredicto → drift negativo', () => {
    expect(computePriceDrift({ initial_price: 100 }, 95)).toBeCloseTo(-5);
  });

  it('sin quote (current null) → null (no inventa 0)', () => {
    expect(computePriceDrift({ initial_price: 100 }, null)).toBeNull();
  });

  it('sin initial_price en el análisis → null', () => {
    expect(computePriceDrift({}, 100)).toBeNull();
    expect(computePriceDrift({ initial_price: null }, 100)).toBeNull();
  });

  it('initial_price 0 → null (evita división por cero)', () => {
    expect(computePriceDrift({ initial_price: 0 }, 100)).toBeNull();
  });

  it('raw null/no-objeto → null', () => {
    expect(computePriceDrift(null, 100)).toBeNull();
    expect(computePriceDrift('x', 100)).toBeNull();
  });
});

describe('priceMoved · umbral propio del reloj 2', () => {
  it(`|drift| ≥ ${PRICE_DRIFT_THRESHOLD_PCT}% → movido`, () => {
    expect(priceMoved(PRICE_DRIFT_THRESHOLD_PCT)).toBe(true);
    expect(priceMoved(-(PRICE_DRIFT_THRESHOLD_PCT + 2))).toBe(true);
  });

  it(`|drift| < ${PRICE_DRIFT_THRESHOLD_PCT}% → no movido`, () => {
    expect(priceMoved(1.5)).toBe(false);
    expect(priceMoved(0)).toBe(false);
  });

  it('null → no movido', () => {
    expect(priceMoved(null)).toBe(false);
  });
});
