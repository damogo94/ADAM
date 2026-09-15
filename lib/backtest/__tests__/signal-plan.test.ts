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

describe('buildSignalTradePlan — forma de 3 args (solo geometría)', () => {
  it('buy: devuelve dirección + niveles SIN entry_type (no hay tipo implícito)', () => {
    expect(buildSignalTradePlan(100, 95, 110)).toEqual({
      direction: 'buy',
      entrada: 100,
      stop_loss: 95,
      target: 110,
    });
  });

  it('sell: devuelve dirección + niveles SIN entry_type', () => {
    const g = buildSignalTradePlan(100, 105, 90);
    expect(g).toEqual({ direction: 'sell', entrada: 100, stop_loss: 105, target: 90 });
    expect(g).not.toHaveProperty('entry_type');
  });

  it('geometría degenerada → null (el caller persiste not_evaluable)', () => {
    expect(buildSignalTradePlan(100, 105, 110)).toBeNull();
  });
});

describe('buildSignalTradePlan — forma de 4 args (plan evaluable)', () => {
  it('entry_type explícito "limit" se preserva', () => {
    expect(buildSignalTradePlan(100, 105, 90, 'limit')).toEqual({
      direction: 'sell',
      entry_type: 'limit',
      entrada: 100,
      stop_loss: 105,
      target: 90,
    });
  });

  it('entry_type explícito "market" se preserva', () => {
    expect(buildSignalTradePlan(100, 95, 110, 'market')).toEqual({
      direction: 'buy',
      entry_type: 'market',
      entrada: 100,
      stop_loss: 95,
      target: 110,
    });
  });

  // R1 (plan de precisión 2026-09): un entry_type desconocido NO degrada a
  // 'market' — eso fabricaba fills (4 filas NULL→market en producción). Sin
  // tipo de entrada no hay plan → el cron persiste not_evaluable.
  it('entry_type NULL → sin plan (nunca market por defecto)', () => {
    expect(buildSignalTradePlan(100, 105, 90, null)).toBeNull();
  });

  it('entry_type undefined explícito → sin plan', () => {
    expect(buildSignalTradePlan(100, 105, 90, undefined)).toBeNull();
  });

  it('entry_type fuera del CHECK (p.ej. "stop") → sin plan', () => {
    expect(buildSignalTradePlan(100, 105, 90, 'stop')).toBeNull();
    expect(buildSignalTradePlan(100, 105, 90, '')).toBeNull();
    expect(buildSignalTradePlan(100, 105, 90, 'MARKET')).toBeNull();
  });

  it('geometría degenerada con entry_type válido → null igualmente', () => {
    expect(buildSignalTradePlan(100, 105, 110, 'market')).toBeNull();
  });
});

// Guard de regresión del bug 2026-07 (migración 0019): una orden LÍMITE cuyo
// nivel de entrada nunca se toca NO es un trade — no puede contar como win. Antes
// del fix se asumía 'market' y se rellenaba al precio del nivel el día 0,
// fabricando "wins" fantasma (p.ej. cortos límite de BTC a 69280 con precio ~63k).
describe('regresión: orden límite no rellenada ≠ win', () => {
  it('short LÍMITE arriba; el precio ya está por debajo y nunca sube al nivel → no_fill (no win)', () => {
    // entry 100 (resistencia), stop 105, target 90. Precio siempre <100 → el
    // límite de venta jamás dispara. Como market, esto sería 'win' (toca 90).
    const plan = buildSignalTradePlan(100, 105, 90, 'limit')!;
    const candles = [k(98, 92), k(95, 89, 90)]; // nunca alcanza 100; toca 90
    const asMarket = evaluateTrade({ ...plan, entry_type: 'market' }, candles, { windowElapsed: true });
    const asLimit = evaluateTrade(plan, candles, { windowElapsed: true });
    expect(asMarket.outcome).toBe('win'); // el bug antiguo
    expect(asLimit.outcome).toBe('no_fill'); // el comportamiento correcto
  });

  it('short LÍMITE que SÍ rebota al nivel y luego cae al target → win legítimo', () => {
    const plan = buildSignalTradePlan(100, 105, 90, 'limit')!;
    // sube y toca 100 (fill), después cae a 90 (target)
    const r = evaluateTrade(plan, [k(101, 99, 100), k(92, 88, 90)], { windowElapsed: false });
    expect(r.outcome).toBe('win');
  });

  it('una señal "limit" NUNCA produce un plan market — ni con null, ni por omisión', () => {
    // El único camino a entry_type='market' es pasar 'market' explícito.
    const fromLimit = buildSignalTradePlan(100, 105, 90, 'limit');
    expect(fromLimit?.entry_type).toBe('limit');
    expect(buildSignalTradePlan(100, 105, 90, null)).toBeNull();
    expect(buildSignalTradePlan(100, 105, 90)).not.toHaveProperty('entry_type');
  });
});

describe('integración señal → plan → evaluateTrade', () => {
  it('señal long que toca target → win', () => {
    const plan = buildSignalTradePlan(100, 95, 110, 'market')!;
    const r = evaluateTrade(plan, [k(101, 99), k(112, 108, 110)], { windowElapsed: false });
    expect(r.outcome).toBe('win');
    expect(r.r_multiple).toBeCloseTo(2);
  });

  it('señal long que toca stop → loss', () => {
    const plan = buildSignalTradePlan(100, 95, 110, 'market')!;
    const r = evaluateTrade(plan, [k(101, 99), k(99, 94, 95)], { windowElapsed: false });
    expect(r.outcome).toBe('loss');
    expect(r.r_multiple).toBeCloseTo(-1);
  });

  it('señal short que cae al target → win', () => {
    const plan = buildSignalTradePlan(100, 105, 90, 'market')!;
    const r = evaluateTrade(plan, [k(101, 99), k(92, 88, 90)], { windowElapsed: false });
    expect(r.outcome).toBe('win');
    expect(r.return_pct).toBeCloseTo(10);
  });

  it('sin barrera y ventana vencida → timeout', () => {
    const plan = buildSignalTradePlan(100, 95, 110, 'market')!;
    const r = evaluateTrade(plan, [k(101, 99), k(102, 98, 100)], { windowElapsed: true });
    expect(r.outcome).toBe('timeout');
  });
});
