/**
 * Tests de lib/backtest/trade-eval.ts — evaluación path-dependent.
 * Verificable a mano con velas sintéticas (OHLC).
 */

import { describe, it, expect } from 'vitest';
import { evaluateTrade, type TradePlan, type EvalCandle } from '../trade-eval';

// h = high, l = low, c = close (default punto medio). t incremental implícito.
let _t = 0;
const k = (h: number, l: number, c = (h + l) / 2): EvalCandle => ({ t: _t++, o: c, h, l, c });

const buyMarket: TradePlan = { direction: 'buy', entry_type: 'market', entrada: 100, stop_loss: 95, target: 110 };
const buyLimit: TradePlan = { direction: 'buy', entry_type: 'limit', entrada: 96, stop_loss: 95, target: 110 };
const sellMarket: TradePlan = { direction: 'sell', entry_type: 'market', entrada: 100, stop_loss: 105, target: 90 };

describe('evaluateTrade — buy a mercado', () => {
  it('win: toca target antes que stop', () => {
    const r = evaluateTrade(buyMarket, [k(101, 99), k(112, 108, 110)], { windowElapsed: false });
    expect(r.outcome).toBe('win');
    expect(r.exit_price).toBe(110);
    expect(r.r_multiple).toBeCloseTo(2); // (110-100)/(100-95)
    expect(r.return_pct).toBeCloseTo(10);
    expect(r.resolved_index).toBe(1);
  });

  it('loss: toca stop antes que target', () => {
    const r = evaluateTrade(buyMarket, [k(101, 99), k(99, 94, 95)], { windowElapsed: false });
    expect(r.outcome).toBe('loss');
    expect(r.exit_price).toBe(95);
    expect(r.r_multiple).toBeCloseTo(-1);
    expect(r.return_pct).toBeCloseTo(-5);
  });

  it('timeout: ni stop ni target, ventana vencida → sale al close', () => {
    const r = evaluateTrade(buyMarket, [k(101, 99), k(102, 98, 100)], { windowElapsed: true });
    expect(r.outcome).toBe('timeout');
    expect(r.exit_price).toBe(100);
    expect(r.r_multiple).toBeCloseTo(0);
  });

  it('pending: sin barrera y ventana NO vencida', () => {
    const r = evaluateTrade(buyMarket, [k(101, 99)], { windowElapsed: false });
    expect(r.status).toBe('pending');
    expect(r.outcome).toBeNull();
  });

  it('ambigüedad misma vela (toca ambos) → loss conservador', () => {
    const r = evaluateTrade(buyMarket, [k(111, 94)], { windowElapsed: false });
    expect(r.outcome).toBe('loss');
    expect(r.exit_price).toBe(95);
  });
});

describe('evaluateTrade — buy límite', () => {
  it('no_fill: nunca toca el nivel y ventana vencida', () => {
    const r = evaluateTrade(buyLimit, [k(101, 98), k(102, 99, 100)], { windowElapsed: true });
    expect(r.outcome).toBe('no_fill');
    expect(r.exit_price).toBeNull();
  });

  it('pending: no ha llenado y ventana NO vencida', () => {
    const r = evaluateTrade(buyLimit, [k(101, 98)], { windowElapsed: false });
    expect(r.status).toBe('pending');
  });

  it('llena en el retroceso y luego toca target → win (R/B alto)', () => {
    const r = evaluateTrade(
      buyLimit,
      [k(101, 99), k(97, 96, 96.5), k(111, 108, 110)],
      { windowElapsed: false }
    );
    expect(r.outcome).toBe('win');
    expect(r.exit_price).toBe(110);
    expect(r.r_multiple).toBeCloseTo(14); // (110-96)/(96-95)
  });

  it('llena y se para en la misma zona → loss', () => {
    const r = evaluateTrade(buyLimit, [k(101, 99), k(97, 94, 95)], { windowElapsed: false });
    expect(r.outcome).toBe('loss');
    expect(r.exit_price).toBe(95);
    expect(r.r_multiple).toBeCloseTo(-1);
  });
});

describe('evaluateTrade — sell a mercado (espejo)', () => {
  it('win: el precio cae al target', () => {
    const r = evaluateTrade(sellMarket, [k(101, 99), k(92, 88, 90)], { windowElapsed: false });
    expect(r.outcome).toBe('win');
    expect(r.exit_price).toBe(90);
    expect(r.r_multiple).toBeCloseTo(2);
    expect(r.return_pct).toBeCloseTo(10);
  });

  it('loss: el precio sube al stop', () => {
    const r = evaluateTrade(sellMarket, [k(101, 99), k(106, 102, 105)], { windowElapsed: false });
    expect(r.outcome).toBe('loss');
    expect(r.exit_price).toBe(105);
    expect(r.r_multiple).toBeCloseTo(-1);
  });
});

describe('evaluateTrade — casos degenerados', () => {
  it('sin velas → not_evaluable', () => {
    const r = evaluateTrade(buyMarket, [], { windowElapsed: true });
    expect(r.outcome).toBe('not_evaluable');
  });

  it('riesgo nulo (stop == entrada) → not_evaluable', () => {
    const plan: TradePlan = { direction: 'buy', entry_type: 'market', entrada: 100, stop_loss: 100, target: 110 };
    const r = evaluateTrade(plan, [k(111, 99)], { windowElapsed: true });
    expect(r.outcome).toBe('not_evaluable');
  });
});
