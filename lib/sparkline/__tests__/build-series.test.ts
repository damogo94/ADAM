import { describe, expect, it } from 'vitest';
import { buildSeriesCloses } from '../build-series';

function mkCandle(c: number, t = 1): { t: number; o: number; h: number; l: number; c: number; v: number } {
  return { t, o: c, h: c, l: c, c, v: 0 };
}

describe('buildSeriesCloses', () => {
  it('candles vacíos → array vacío', () => {
    expect(buildSeriesCloses([], '7d')).toEqual([]);
    expect(buildSeriesCloses([], '30d')).toEqual([]);
  });

  it('input no-array → array vacío (defensive)', () => {
    // @ts-expect-error: validamos comportamiento ante input mal tipado.
    expect(buildSeriesCloses(null, '7d')).toEqual([]);
  });

  it('7d devuelve hasta 7 cierres', () => {
    const candles = Array.from({ length: 20 }, (_, i) => mkCandle(i + 100));
    const r = buildSeriesCloses(candles, '7d');
    expect(r).toHaveLength(7);
    expect(r[0]).toBe(113);
    expect(r[6]).toBe(119);
  });

  it('30d devuelve hasta 30 cierres', () => {
    const candles = Array.from({ length: 60 }, (_, i) => mkCandle(i + 100));
    const r = buildSeriesCloses(candles, '30d');
    expect(r).toHaveLength(30);
    expect(r[29]).toBe(159);
  });

  it('si hay menos candles que puntos pedidos, devuelve todos', () => {
    const candles = Array.from({ length: 3 }, (_, i) => mkCandle(i + 100));
    expect(buildSeriesCloses(candles, '7d')).toEqual([100, 101, 102]);
  });

  it('filtra cierres no finitos (NaN/Infinity)', () => {
    const candles = [
      mkCandle(100),
      { t: 2, o: 0, h: 0, l: 0, c: NaN, v: 0 },
      mkCandle(102),
      { t: 4, o: 0, h: 0, l: 0, c: Infinity, v: 0 },
      mkCandle(103),
    ];
    expect(buildSeriesCloses(candles, '7d')).toEqual([100, 102, 103]);
  });
});
