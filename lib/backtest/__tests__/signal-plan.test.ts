/**
 * Tests de lib/backtest/signal-plan.ts — inferencia de dirección y construcción
 * del TradePlan de una señal CMT, + integración con evaluateTrade (reutilizado).
 */

import { describe, it, expect } from 'vitest';
import { inferSignalDirection, buildSignalTradePlan } from '../signal-plan';
import { evaluateTrade, type EvalCandle } from '../trade-eval';

let _t = 0;
const k = (h: number, l: number, c = (h + l) / 2): EvalCandle => ({ t: _t++, o: c, h, l, c });

describe('inferSignalDirection — geometría de niveles', () => {
  it('long: target arriba, stop abajo → buy', () => {
    expect(inferSignalDirection(100, 95, 110)).toBe('buy');
  });

  it('short: target abajo, stop arriba → sell', () => {
    expect(inferSignalDirection(100, 105, 90)).toBe('sell');
  });

  it('degenerado: ambos niveles arriba → null', () => {
    expect(inferSignalDirection(100, 105, 110)).toBeNull();
  });

  it('degenerado: ambos niveles abajo → null', () => {
    expect(inferSignalDirection(100, 95, 90)).toBeNull();
  });

  it('degenerado: stop == entrada → null (riesgo nulo)', () => {
    expect(inferSignalDirection(100, 100, 110)).toBeNull();
  });

  it('degenerado: target == entrada → null (sin recorrido)', () => {
    expect(inferSignalDirection(100, 95, 100)).toBeNull();
  });
});

describe('buildSignalTradePlan', () => {
  it('buy: arma plan market con los niveles', () => {
    expect(buildSignalTradePlan(100, 95, 110)).toEqual({
      direction: 'buy',
      entry_type: 'market',
      entrada: 100,
      stop_loss: 95,
      target: 110,
    });
  });

  it('sell: arma plan market con los niveles', () => {
    expect(buildSignalTradePlan(100, 105, 90)).toEqual({
      direction: 'sell',
      entry_type: 'market',
      entrada: 100,
      stop_loss: 105,
      target: 90,
    });
  });

  it('geometría degenerada → null (el caller persiste not_evaluable)', () => {
    expect(buildSignalTradePlan(100, 105, 110)).toBeNull();
  });
});

describe('integración señal → plan → evaluateTrade', () => {
  it('señal long que toca target → win', () => {
    const plan = buildSignalTradePlan(100, 95, 110)!;
    const r = evaluateTrade(plan, [k(101, 99), k(112, 108, 110)], { windowElapsed: false });
    expect(r.outcome).toBe('win');
    expect(r.r_multiple).toBeCloseTo(2);
  });

  it('señal long que toca stop → loss', () => {
    const plan = buildSignalTradePlan(100, 95, 110)!;
    const r = evaluateTrade(plan, [k(101, 99), k(99, 94, 95)], { windowElapsed: false });
    expect(r.outcome).toBe('loss');
    expect(r.r_multiple).toBeCloseTo(-1);
  });

  it('señal short que cae al target → win', () => {
    const plan = buildSignalTradePlan(100, 105, 90)!;
    const r = evaluateTrade(plan, [k(101, 99), k(92, 88, 90)], { windowElapsed: false });
    expect(r.outcome).toBe('win');
    expect(r.return_pct).toBeCloseTo(10);
  });

  it('sin barrera y ventana vencida → timeout', () => {
    const plan = buildSignalTradePlan(100, 95, 110)!;
    const r = evaluateTrade(plan, [k(101, 99), k(102, 98, 100)], { windowElapsed: true });
    expect(r.outcome).toBe('timeout');
  });
});
