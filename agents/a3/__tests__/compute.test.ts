/**
 * Tests del orquestador agents/a3/compute.ts
 *
 * Cubre los acceptance criteria de Tarea 1.3:
 *   - Output pasa A3Output.omit({narrative}).strict().parse() ✅
 *   - Reproducibilidad bit-exact ✅
 *   - Reglas operativas: ohlcv<20 → hold, ohlcv<200 → sma200 null ✅
 */

import { describe, it, expect } from 'vitest';
import { computeTechnical } from '../compute';
import { A3Output } from '@/agents/shared/types';
import {
  flatPrice,
  linearUp,
  linearDown,
  sideways,
  doubleTopShape,
} from '../compute/__tests__/fixtures';

const A3WithoutNarrative = A3Output.omit({ narrative: true }).strict();

describe('computeTechnical — schema validation', () => {
  it('output válido para serie alcista de 250 velas', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: linearUp(250, 100, 0.5),
      timeframe: '1D',
    });
    expect(() => A3WithoutNarrative.parse(out)).not.toThrow();
  });

  it('output válido para serie lateral', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: sideways(100, 95, 105),
      timeframe: '1D',
    });
    expect(() => A3WithoutNarrative.parse(out)).not.toThrow();
  });

  it('output válido con datos insuficientes (<20)', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: flatPrice(10, 100),
      timeframe: '1D',
    });
    expect(() => A3WithoutNarrative.parse(out)).not.toThrow();
    // Regla #4
    expect(out.operativa.signal).toBe('hold');
    expect(out.confidence).toBeLessThanOrEqual(30);
  });
});

describe('computeTechnical — reglas operativas', () => {
  it('<200 velas → sma200 null', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: flatPrice(100, 100),
      timeframe: '1D',
    });
    expect(out.medias.sma200).toBeNull();
  });

  it('≥200 velas → sma200 NO null', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: flatPrice(250, 100),
      timeframe: '1D',
    });
    expect(out.medias.sma200).not.toBeNull();
  });

  it('<20 velas → confidence ≤ 30 y signal hold', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: flatPrice(15, 100),
      timeframe: '1D',
    });
    expect(out.confidence).toBeLessThanOrEqual(30);
    expect(out.operativa.signal).toBe('hold');
  });
});

describe('computeTechnical — campos específicos', () => {
  it('serie alcista → tendencia primaria alcista', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: linearUp(100, 100, 1),
      timeframe: '1D',
    });
    expect(out.tendencia.primaria).toBe('alcista');
  });

  it('serie bajista → tendencia bajista', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: linearDown(100, 200, 1),
      timeframe: '1D',
    });
    expect(out.tendencia.primaria).toBe('bajista');
  });

  it('doble techo → patron_detectado = "doble techo"', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: doubleTopShape(),
      timeframe: '1D',
    });
    expect(out.patron_detectado).toBe('doble techo');
  });

  it('timeframes_analizados contiene el timeframe pasado', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: flatPrice(50, 100),
      timeframe: '4H',
    });
    expect(out.timeframes_analizados).toContain('4H');
  });

  it('factor_invalidacion siempre presente y no vacío', () => {
    const out = computeTechnical({
      ticker: 'TEST',
      ohlcv: flatPrice(50, 100),
      timeframe: '1D',
    });
    expect(out.factor_invalidacion.length).toBeGreaterThan(0);
  });
});

describe('computeTechnical — determinismo bit-exact', () => {
  it('mismo input → mismo output, exactamente', () => {
    const input = {
      ticker: 'TEST',
      ohlcv: linearUp(100, 100, 1),
      timeframe: '1D' as const,
    };
    const a = computeTechnical(input);
    const b = computeTechnical(input);
    // Deep equal — Vitest hace structural comparison
    expect(a).toEqual(b);
  });

  it('escenarios sintéticos: determinismo se mantiene en 5 ejecuciones', () => {
    const input = {
      ticker: 'TEST',
      ohlcv: sideways(60, 95, 105, 10),
      timeframe: '1D' as const,
    };
    const runs = Array.from({ length: 5 }, () => computeTechnical(input));
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });
});
