/**
 * Tests de agents/cmt/build-signal.ts — CMT determinista.
 *
 * Dos bloques:
 *   1. classifyCMTLevel — mapeo nivel (pura, exhaustiva).
 *   2. buildCMTSignal — smoke end-to-end (estructura, determinismo, aislamiento).
 */

import { describe, it, expect } from 'vitest';
import { buildCMTSignal, classifyCMTLevel } from '../build-signal';
import { CMT_OUTPUT_SCHEMA } from '../schema';
import { linearUp, flatPrice } from '@/agents/a3/compute/__tests__/fixtures';

describe('classifyCMTLevel — mapeo determinista', () => {
  const base = { confidence: 80, entryType: 'market' as const, mtfDivergent: false };

  it('hold → sin_senal', () => {
    expect(classifyCMTLevel({ ...base, signal: 'hold', rb: 3 })).toBe('sin_senal');
  });

  it('R/B null → sin_senal', () => {
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: null })).toBe('sin_senal');
  });

  it('R/B < 1.5 → sin_senal', () => {
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: 1.4 })).toBe('sin_senal');
  });

  it('R/B≥2.5 · conf≥70 · market · no divergente → urgente', () => {
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: 2.5 })).toBe('urgente');
    expect(classifyCMTLevel({ ...base, signal: 'sell', rb: 3.2 })).toBe('urgente');
  });

  it('urgente baja a atencion si MTF divergente', () => {
    expect(
      classifyCMTLevel({ ...base, signal: 'buy', rb: 3, mtfDivergent: true })
    ).toBe('atencion');
  });

  it('urgente baja a atencion si confianza < 70', () => {
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: 3, confidence: 65 })).toBe('atencion');
  });

  it('urgente baja a atencion si entrada en límite (no market)', () => {
    expect(
      classifyCMTLevel({ ...base, signal: 'buy', rb: 3, entryType: 'limit' })
    ).toBe('atencion');
  });

  it('R/B≥1.8 · conf≥50 → atencion', () => {
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: 1.8, confidence: 50 })).toBe('atencion');
  });

  it('R/B≥1.8 pero conf < 50 → monitorear', () => {
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: 2.0, confidence: 40 })).toBe('monitorear');
  });

  it('R/B en [1.5, 1.8) → monitorear', () => {
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: 1.5 })).toBe('monitorear');
    expect(classifyCMTLevel({ ...base, signal: 'buy', rb: 1.7, confidence: 90 })).toBe('monitorear');
  });
});

describe('buildCMTSignal — smoke end-to-end', () => {
  it('serie alcista de 250 velas → CMTOutput válido, timeframe 1D', () => {
    const out = buildCMTSignal({ ticker: 'TEST', ohlcv: linearUp(250, 100, 1) });
    // No lanza = el parse del schema pasó dentro de buildCMTSignal.
    expect(() => CMT_OUTPUT_SCHEMA.parse(out)).not.toThrow();
    expect(out.ticker).toBe('TEST');
    expect(out.timeframe).toBe('1D');
    expect(out.confidence_pct).toBeGreaterThanOrEqual(0);
    expect(out.confidence_pct).toBeLessThanOrEqual(100);
  });

  it('indicators tiene entre 3 y 5 entradas (≤5 lo exige el schema)', () => {
    const out = buildCMTSignal({ ticker: 'TEST', ohlcv: linearUp(250, 100, 1) });
    const n = Object.keys(out.indicators).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  });

  it('<20 velas → hold → sin_senal', () => {
    const out = buildCMTSignal({ ticker: 'TEST', ohlcv: flatPrice(15, 100) });
    expect(out.level).toBe('sin_senal');
    expect(out.entry_price).toBeNull();
  });

  it('determinista: mismo input → mismo output', () => {
    const input = { ticker: 'TEST', ohlcv: linearUp(250, 100, 1) };
    expect(buildCMTSignal(input)).toEqual(buildCMTSignal(input));
  });

  it('aislamiento: clave fuera de OHLCV lanza', () => {
    expect(() =>
      // @ts-expect-error — campo prohibido a propósito (test de aislamiento runtime)
      buildCMTSignal({ ticker: 'TEST', ohlcv: flatPrice(50, 100), news: ['inyección'] })
    ).toThrow(/isolation violation/);
  });
});
