import { describe, expect, it } from 'vitest';
import {
  blockBootstrap,
  holm,
  mean,
  median,
  mulberry32,
  pOneSided,
  percentileCI,
  quarterCluster,
} from '../stats';

describe('mulberry32', () => {
  it('es determinista por semilla y produce uniformes en [0,1)', () => {
    const a = mulberry32(20260911);
    const b = mulberry32(20260911);
    const xs = Array.from({ length: 5 }, () => a());
    const ys = Array.from({ length: 5 }, () => b());
    expect(xs).toEqual(ys);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('mean / median / quarterCluster', () => {
  it('mean y median básicos, NaN sobre vacío', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(mean([]))).toBe(true);
  });
  it('cluster ticker × trimestre UTC', () => {
    expect(quarterCluster('SPY', Date.UTC(2020, 0, 15))).toBe('SPY:2020Q1');
    expect(quarterCluster('SPY', Date.UTC(2020, 11, 31))).toBe('SPY:2020Q4');
  });
});

describe('blockBootstrap + percentileCI + pOneSided', () => {
  it('re-muestrea clusters (no elementos): con un solo cluster la media es constante', () => {
    const boots = blockBootstrap([[1, 2, 3]], mean, 50, 7);
    expect(boots).toHaveLength(50);
    expect(boots.every((x) => x === 2)).toBe(true);
  });
  it('determinista por semilla; el IC contiene la media muestral; p pequeño con señal clara', () => {
    const groups = [
      [1, 1.2],
      [0.8, 1.1],
      [1.3],
      [0.9, 1.0],
      [1.1],
    ];
    const b1 = blockBootstrap(groups, mean, 300, 42);
    const b2 = blockBootstrap(groups, mean, 300, 42);
    expect(b1).toEqual(b2);
    const ci = percentileCI(b1);
    expect(ci.lo).toBeLessThanOrEqual(mean(groups.flat()));
    expect(ci.hi).toBeGreaterThanOrEqual(mean(groups.flat()));
    expect(pOneSided(b1)).toBeLessThan(0.05);
  });
  it('p ≈ 1 cuando el estadístico nunca supera 0; vacío → 1', () => {
    expect(pOneSided([-1, -2, 0])).toBe(1);
    expect(pOneSided([])).toBe(1);
    expect(blockBootstrap([], mean, 10, 1)).toEqual([]);
  });
});

describe('holm', () => {
  it('step-down: ajusta y es monótono en el orden de p', () => {
    const r = holm([
      { name: 'a', p: 0.01 },
      { name: 'b', p: 0.04 },
      { name: 'c', p: 0.03 },
    ]);
    const by = Object.fromEntries(r.map((x) => [x.name, x]));
    expect(by.a!.p_adj).toBeCloseTo(0.03, 10); // 3 × 0.01
    expect(by.c!.p_adj).toBeCloseTo(0.06, 10); // max(0.03, 2 × 0.03)
    expect(by.b!.p_adj).toBeCloseTo(0.06, 10); // max(0.06, 1 × 0.04)
    expect(by.a!.reject).toBe(true);
    expect(by.b!.reject).toBe(false);
    expect(by.c!.reject).toBe(false);
  });
  it('respeta alpha y capa a 1', () => {
    const r = holm([{ name: 'x', p: 0.9 }, { name: 'y', p: 0.02 }], 0.05);
    expect(r.find((t) => t.name === 'x')!.p_adj).toBeCloseTo(0.9, 10); // max(2×0.02, 1×0.9)
    expect(r.find((t) => t.name === 'y')!.reject).toBe(true);
    const capped = holm([{ name: 'a', p: 0.6 }, { name: 'b', p: 0.7 }]);
    expect(capped.every((t) => t.p_adj === 1 && !t.reject)).toBe(true); // 2×0.6 = 1.2 → 1, monótono
  });
});
