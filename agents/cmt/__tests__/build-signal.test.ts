/**
 * Tests de agents/cmt/build-signal.ts — CMT determinista.
 *
 * Dos bloques:
 *   1. classifyCMTLevel — mapeo nivel (pura, exhaustiva).
 *   2. buildCMTSignal — smoke end-to-end (estructura, determinismo, aislamiento).
 */

import { describe, it, expect } from 'vitest';
import {
  buildCMTSignal,
  classifyCMTLevel,
  distanceInAtr,
  ENTRY_REACH_ATR,
  TARGET_MAX_ATR,
} from '../build-signal';
import { CMT_OUTPUT_SCHEMA } from '../schema';
import { linearUp, flatPrice } from '@/agents/a3/compute/__tests__/fixtures';

/**
 * Semántica R10 (plan de precisión 2026-09): el nivel describe TIPO DE ENTRADA
 * y ALCANZABILIDAD, no calidad. Confianza y MTF ya no votan.
 */
describe('classifyCMTLevel — nivel por tipo de entrada / alcanzabilidad (R10)', () => {
  const market = { signal: 'buy' as const, rb: 2, entryType: 'market' as const, entryDistanceAtr: 0, targetDistanceAtr: 3 };
  const limit = { signal: 'sell' as const, rb: 2, entryType: 'limit' as const, entryDistanceAtr: 1, targetDistanceAtr: 3 };

  it('hold → sin_senal', () => {
    expect(classifyCMTLevel({ ...market, signal: 'hold' })).toBe('sin_senal');
  });

  it('R/B null → sin_senal', () => {
    expect(classifyCMTLevel({ ...market, rb: null })).toBe('sin_senal');
  });

  it('R/B < 1.5 → sin_senal', () => {
    expect(classifyCMTLevel({ ...market, rb: 1.4 })).toBe('sin_senal');
  });

  // ── Tabla de niveles: 3 casos canónicos ─────────────────────────────
  it('entrada a mercado (ejecutable hoy) → urgente', () => {
    expect(classifyCMTLevel(market)).toBe('urgente');
    expect(classifyCMTLevel({ ...market, signal: 'sell' })).toBe('urgente');
  });

  it('límite a ≤ 2 ATR del último cierre (alcanzable) → atencion', () => {
    expect(classifyCMTLevel(limit)).toBe('atencion');
    expect(classifyCMTLevel({ ...limit, entryDistanceAtr: ENTRY_REACH_ATR })).toBe('atencion');
  });

  it('límite a > 2 ATR → monitorear', () => {
    expect(classifyCMTLevel({ ...limit, entryDistanceAtr: 2.01 })).toBe('monitorear');
    expect(classifyCMTLevel({ ...limit, entryDistanceAtr: 4.9 })).toBe('monitorear');
  });

  // ── Coherencia target↔ventana (F3) ──────────────────────────────────
  it('K = |target−entrada|/ATR > √30 → monitorear, también con entrada a mercado', () => {
    expect(classifyCMTLevel({ ...market, targetDistanceAtr: 6 })).toBe('monitorear');
    expect(classifyCMTLevel({ ...limit, targetDistanceAtr: 8 })).toBe('monitorear');
  });

  it('K justo en √30 sigue siendo coherente', () => {
    expect(classifyCMTLevel({ ...market, targetDistanceAtr: TARGET_MAX_ATR })).toBe('urgente');
    expect(TARGET_MAX_ATR).toBeCloseTo(5.477, 3);
  });

  // ── Independencia de la "calidad" ───────────────────────────────────
  it('el R/B alto NO sube el nivel: una límite lejana con R/B 4 sigue en monitorear', () => {
    expect(classifyCMTLevel({ ...limit, rb: 4, entryDistanceAtr: 3 })).toBe('monitorear');
  });

  it('el R/B bajo NO baja el nivel: mercado con R/B 1.5 es urgente', () => {
    expect(classifyCMTLevel({ ...market, rb: 1.5 })).toBe('urgente');
  });

  // ── Distancias no medibles ──────────────────────────────────────────
  it('límite sin distancia medible (ATR null) → monitorear; mercado sin ATR → urgente', () => {
    expect(classifyCMTLevel({ ...limit, entryDistanceAtr: null, targetDistanceAtr: null })).toBe('monitorear');
    expect(classifyCMTLevel({ ...market, entryDistanceAtr: null, targetDistanceAtr: null })).toBe('urgente');
  });

  it('entry_type null con señal viva → monitorear (no se puede afirmar ejecutabilidad)', () => {
    expect(classifyCMTLevel({ ...market, entryType: null })).toBe('monitorear');
  });
});

describe('distanceInAtr', () => {
  it('|a−b|/atr', () => {
    expect(distanceInAtr(110, 100, 5)).toBe(2);
    expect(distanceInAtr(100, 110, 5)).toBe(2);
  });

  it('null si falta un operando o el ATR no es positivo', () => {
    expect(distanceInAtr(null, 100, 5)).toBeNull();
    expect(distanceInAtr(110, null, 5)).toBeNull();
    expect(distanceInAtr(110, 100, null)).toBeNull();
    expect(distanceInAtr(110, 100, 0)).toBeNull();
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

  it('indicators tiene entre 3 y 6 entradas e incluye rango_52s con ≥200 velas', () => {
    const out = buildCMTSignal({ ticker: 'TEST', ohlcv: linearUp(250, 100, 1) });
    const n = Object.keys(out.indicators).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
    // ≥200 velas → el rango de 52s entra en el map (opción C, sin migración).
    expect(out.indicators.rango_52s).toBeDefined();
  });

  it('<20 velas → hold → sin_senal', () => {
    const out = buildCMTSignal({ ticker: 'TEST', ohlcv: flatPrice(15, 100) });
    expect(out.level).toBe('sin_senal');
    expect(out.entry_price).toBeNull();
    expect(out.entry_type).toBeNull();
  });

  it('persiste entry_type del compute (market|limit|null) — load-bearing para el backtest', () => {
    const out = buildCMTSignal({ ticker: 'TEST', ohlcv: linearUp(250, 100, 1) });
    // El campo SIEMPRE está presente (el schema lo exige, aunque sea null).
    expect(['market', 'limit', null]).toContain(out.entry_type);
    // Coherencia con el precio de entrada: si hay trade, hay tipo; si no, null.
    if (out.entry_price !== null) expect(out.entry_type).not.toBeUndefined();
    else expect(out.entry_type).toBeNull();
  });

  it('el nivel es coherente con entry_type (R10): market → urgente/monitorear, limit → nunca urgente', () => {
    const out = buildCMTSignal({ ticker: 'TEST', ohlcv: linearUp(250, 100, 1) });
    if (out.level === 'sin_senal') return; // la fixture no garantiza señal viva
    if (out.entry_type === 'market') expect(['urgente', 'monitorear']).toContain(out.level);
    if (out.entry_type === 'limit') expect(['atencion', 'monitorear']).toContain(out.level);
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
