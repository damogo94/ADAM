import { describe, it, expect } from 'vitest';
import { nearestRound, roundStep } from '../redondos';
import { profileFor } from '@/agents/a3/profiles';

describe('redondos — números psicológicos por magnitud (manual §3)', () => {
  it('oro ~2000 → grid de 50', () => {
    const p = profileFor('XAU/USD'); // commodity
    expect(roundStep(2000, p)).toBe(50);
    expect(nearestRound(2030, p)?.nivel).toBe(2050);
    expect(nearestRound(2000, p)?.distancia_pct).toBe(0);
  });

  it('índice ~20000 → grid de 500', () => {
    const p = profileFor('TEST'); // equity
    expect(roundStep(20000, p)).toBe(500);
    expect(nearestRound(20100, p)?.nivel).toBe(20000);
  });

  it('forex → grid fijo de 50 pips', () => {
    const p = profileFor('EURUSD=X'); // forex
    expect(roundStep(1.0832, p)).toBe(0.005);
    expect(nearestRound(1.0832, p)?.nivel).toBe(1.085);
  });

  it('nivel inválido → null', () => {
    const p = profileFor('TEST');
    expect(nearestRound(0, p)).toBeNull();
    expect(nearestRound(-5, p)).toBeNull();
  });
});
