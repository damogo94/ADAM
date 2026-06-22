import { describe, it, expect } from 'vitest';
import { scoreSignal, returnPct, SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K } from '../scoring';

describe('returnPct', () => {
  it('calcula retorno positivo correctamente', () => {
    expect(returnPct(100, 105)).toBeCloseTo(5);
  });

  it('calcula retorno negativo correctamente', () => {
    expect(returnPct(100, 95)).toBeCloseTo(-5);
  });

  it('devuelve 0 si el inicial es 0 (evita división por cero)', () => {
    expect(returnPct(0, 50)).toBe(0);
  });
});

describe('scoreSignal — direccion alcista', () => {
  it('hit cuando retorno >= +threshold', () => {
    expect(scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 102 }).hit).toBe(true);
    expect(scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 110 }).hit).toBe(true);
  });

  it('miss cuando retorno < +threshold', () => {
    expect(scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 101.99 }).hit).toBe(false);
    expect(scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 100 }).hit).toBe(false);
    expect(scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 95 }).hit).toBe(false);
  });
});

describe('scoreSignal — direccion bajista', () => {
  it('hit cuando retorno <= -threshold', () => {
    expect(scoreSignal({ direccion: 'bajista', initial_price: 100, eval_price: 98 }).hit).toBe(true);
    expect(scoreSignal({ direccion: 'bajista', initial_price: 100, eval_price: 90 }).hit).toBe(true);
  });

  it('miss cuando retorno > -threshold', () => {
    expect(scoreSignal({ direccion: 'bajista', initial_price: 100, eval_price: 98.01 }).hit).toBe(false);
    expect(scoreSignal({ direccion: 'bajista', initial_price: 100, eval_price: 105 }).hit).toBe(false);
  });
});

describe('scoreSignal — direccion neutral', () => {
  it('hit cuando |retorno| < threshold', () => {
    expect(scoreSignal({ direccion: 'neutral', initial_price: 100, eval_price: 100 }).hit).toBe(true);
    expect(scoreSignal({ direccion: 'neutral', initial_price: 100, eval_price: 101 }).hit).toBe(true);
    expect(scoreSignal({ direccion: 'neutral', initial_price: 100, eval_price: 99 }).hit).toBe(true);
  });

  it('miss cuando |retorno| >= threshold', () => {
    expect(scoreSignal({ direccion: 'neutral', initial_price: 100, eval_price: 102 }).hit).toBe(false);
    expect(scoreSignal({ direccion: 'neutral', initial_price: 100, eval_price: 98 }).hit).toBe(false);
  });
});

describe('SIGNAL_THRESHOLD_PCT', () => {
  it('es 2.0 en v1', () => {
    expect(SIGNAL_THRESHOLD_PCT).toBe(2.0);
  });
});

describe('scoreSignal — threshold_pct custom (ATR-adjusted)', () => {
  it('sin threshold_pct → usa el default 2%', () => {
    expect(scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 103 }).hit).toBe(true);
  });

  it('umbral 4% (ATR alto, p.ej. BTC): +3% alcista NO es hit; +5% sí', () => {
    expect(
      scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 103, threshold_pct: 4 }).hit
    ).toBe(false);
    expect(
      scoreSignal({ direccion: 'alcista', initial_price: 100, eval_price: 105, threshold_pct: 4 }).hit
    ).toBe(true);
  });

  it('umbral alto también endurece bajista y ensancha neutral', () => {
    expect(
      scoreSignal({ direccion: 'bajista', initial_price: 100, eval_price: 97, threshold_pct: 4 }).hit
    ).toBe(false);
    expect(
      scoreSignal({ direccion: 'neutral', initial_price: 100, eval_price: 103, threshold_pct: 4 }).hit
    ).toBe(true);
  });

  it('SIGNAL_ATR_K es 1.0 (tunable)', () => {
    expect(SIGNAL_ATR_K).toBe(1.0);
  });
});
