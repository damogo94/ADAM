import { describe, it, expect } from 'vitest';
import { aggregateOHLCV, analyzeMtf, mtfConfidenceDelta } from '../mtf';
import type { OHLCVCandle_t } from '@/agents/shared/types';

function c(t: number, o: number, h: number, l: number, close: number, v = 1000): OHLCVCandle_t {
  return { t, o, h, l, c: close, v };
}

describe('aggregateOHLCV', () => {
  it('agrega 4 velas hourly en 1 vela 4H — open primera, close última, high max, low min, vol suma', () => {
    const hourly = [
      c(1, 100, 105, 99, 102, 1000),
      c(2, 102, 108, 101, 107, 1500),
      c(3, 107, 110, 105, 106, 800),
      c(4, 106, 109, 104, 108, 1200),
    ];
    const agg = aggregateOHLCV(hourly, 4);
    expect(agg).toHaveLength(1);
    expect(agg[0]).toEqual({ t: 1, o: 100, h: 110, l: 99, c: 108, v: 4500 });
  });

  it('descarta velas residuales que no completan bucket', () => {
    const hourly = [
      c(1, 100, 101, 99, 100),
      c(2, 100, 101, 99, 100),
      c(3, 100, 101, 99, 100),
      c(4, 100, 101, 99, 100),
      c(5, 100, 101, 99, 100), // sobra
    ];
    const agg = aggregateOHLCV(hourly, 4);
    expect(agg).toHaveLength(1);
  });

  it('multiplier 1 o menor devuelve la copia tal cual', () => {
    const candles = [c(1, 100, 101, 99, 100)];
    expect(aggregateOHLCV(candles, 1)).toEqual(candles);
    expect(aggregateOHLCV(candles, 0)).toEqual(candles);
  });
});

describe('analyzeMtf', () => {
  it('devuelve null si no hay intraday', () => {
    expect(analyzeMtf('alcista', null)).toBeNull();
    expect(analyzeMtf('alcista', undefined)).toBeNull();
  });

  it('devuelve null si intraday tiene < 24 velas', () => {
    const short = Array.from({ length: 20 }, (_, i) => c(i, 100, 101, 99, 100));
    expect(analyzeMtf('alcista', short)).toBeNull();
  });

  it('devuelve null si tras agregar quedan < 20 buckets 4H', () => {
    // 24 hourly → 6 buckets 4H, insuficiente para detectTrend robusto
    const hourly = Array.from({ length: 24 }, (_, i) => c(i, 100, 101, 99, 100));
    expect(analyzeMtf('alcista', hourly)).toBeNull();
  });

  it("clasifica 'confirmed' cuando ambos timeframes son alcistas", () => {
    // 80 hourly → 20 buckets 4H con tendencia clara alcista
    const hourly = Array.from({ length: 100 }, (_, i) =>
      c(i, 100 + i, 101 + i, 99 + i, 100.5 + i)
    );
    const result = analyzeMtf('alcista', hourly);
    expect(result).not.toBeNull();
    expect(result!.alignment).toBe('confirmed');
    expect(result!.h4_trend).toBe('alcista');
    expect(result!.reason).toMatch(/confluencia/i);
  });

  it("clasifica 'divergent' cuando timeframes son direccionales opuestos", () => {
    // intraday cayendo fuerte vs daily alcista
    const hourly = Array.from({ length: 100 }, (_, i) =>
      c(i, 200 - i, 201 - i, 199 - i, 199.5 - i)
    );
    const result = analyzeMtf('alcista', hourly);
    expect(result).not.toBeNull();
    expect(result!.alignment).toBe('divergent');
    expect(result!.h4_trend).toBe('bajista');
    expect(result!.reason).toMatch(/divergencia/i);
  });

  it("clasifica 'neutral' cuando daily es lateral", () => {
    const hourly = Array.from({ length: 100 }, (_, i) =>
      c(i, 100 + i, 101 + i, 99 + i, 100.5 + i)
    );
    const result = analyzeMtf('lateral', hourly);
    expect(result!.alignment).toBe('neutral');
  });
});

describe('mtfConfidenceDelta', () => {
  it('+5 confirmed, -10 divergent, 0 neutral', () => {
    expect(mtfConfidenceDelta('confirmed')).toBe(5);
    expect(mtfConfidenceDelta('divergent')).toBe(-10);
    expect(mtfConfidenceDelta('neutral')).toBe(0);
  });
});
