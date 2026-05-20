import { describe, it, expect } from 'vitest';
import { scoreSignal, returnPct, SIGNAL_THRESHOLD_PCT } from '../scoring';

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
