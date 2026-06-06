/**
 * Tests para agents/a3/compute/operative.ts
 *
 * Cubre las reglas operativas del plan §5 Tarea 1.3:
 *   - R/B mínimo 1.5:1
 *   - Stop al otro lado del nivel técnico
 *   - Target sobre nivel técnico
 *   - <20 velas → hold
 *   - Horizonte derivado del span temporal
 */

import { describe, it, expect } from 'vitest';
import {
  computeOperativa,
  MIN_RB_RATIO,
  MIN_CANDLES_FOR_SIGNAL,
} from '../operative';
import { flatPrice, linearUp } from './fixtures';

describe('computeOperativa — regla #4 (<20 velas → hold)', () => {
  it('signal hold con niveles null si hay pocas velas', () => {
    const r = computeOperativa({
      candles: flatPrice(10, 100),
      tendencia: 'alcista',
      levels: { soportes: [95], resistencias: [110] },
      atr: 1,
    });
    expect(r.signal).toBe('hold');
    expect(r.entrada).toBeNull();
    expect(r.stop_loss).toBeNull();
    expect(r.target).toBeNull();
  });
});

describe('computeOperativa — caso BUY', () => {
  it('alcista + precio cerca de soporte + R/B≥1.5 → buy con niveles válidos', () => {
    // Precio actual ~100, soporte cerca (98), resistencia lejos (110).
    // R/B = (110-100)/(100-(98-1)) = 10 / 3 ≈ 3.33 → válido
    const candles = flatPrice(30, 100);
    const r = computeOperativa({
      candles,
      tendencia: 'alcista',
      levels: { soportes: [98], resistencias: [110] },
      atr: 1,
    });
    expect(r.signal).toBe('buy');
    expect(r.entrada).not.toBeNull();
    expect(r.stop_loss).not.toBeNull();
    expect(r.target).not.toBeNull();
    expect(r.ratio_riesgo_beneficio).not.toBeNull();
    expect(r.ratio_riesgo_beneficio!).toBeGreaterThanOrEqual(MIN_RB_RATIO);
  });

  it('R/B < 1.5 → hold (rechaza setup)', () => {
    // Resistencia muy cerca → beneficio chico
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [99], resistencias: [101] }, // beneficio=1, riesgo≥1 → R/B≤1
      atr: 1,
    });
    expect(r.signal).toBe('hold');
    expect(r.entrada).toBeNull();
  });

  it('precio lejos del soporte (>3%) → hold (no es entrada limpia)', () => {
    // Soporte a 90 (10% abajo), precio 100. Demasiado lejos para "entrada en rebote".
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [90], resistencias: [110] },
      atr: 1,
    });
    expect(r.signal).toBe('hold');
  });

  it('sin niveles → hold', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [], resistencias: [] },
      atr: 1,
    });
    expect(r.signal).toBe('hold');
  });
});

describe('computeOperativa — caso SELL', () => {
  it('bajista + precio cerca de resistencia + R/B≥1.5 → sell', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'bajista',
      levels: { soportes: [90], resistencias: [102] }, // resistencia justo arriba
      atr: 1,
    });
    expect(r.signal).toBe('sell');
    expect(r.entrada).not.toBeNull();
    expect(r.ratio_riesgo_beneficio!).toBeGreaterThanOrEqual(MIN_RB_RATIO);
  });
});

describe('computeOperativa — plan limit/market (ADR-002 fase 2)', () => {
  it('soporte alcanzable pero fuera de proximidad → buy LÍMITE en el nivel', () => {
    // soporte 96 (4% abajo): >3% proximidad pero <5·ATR → entrada límite EN 96
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [96], resistencias: [110] },
      atr: 1,
    });
    expect(r.signal).toBe('buy');
    expect(r.entry_type).toBe('limit');
    expect(r.entrada).toBe(96);
  });

  it('precio pegado al soporte → buy MARKET (entrada = precio actual)', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [98], resistencias: [110] },
      atr: 1,
    });
    expect(r.signal).toBe('buy');
    expect(r.entry_type).toBe('market');
    expect(r.entrada).toBe(100);
  });

  it('nivel no alcanzable (>REACH_ATR_MULT·ATR) → hold', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [90], resistencias: [110] }, // 10·ATR > 5 → fantasía
      atr: 1,
    });
    expect(r.signal).toBe('hold');
    expect(r.entry_type).toBeNull();
  });

  it('sell: resistencia alcanzable fuera de proximidad → sell LÍMITE en el nivel', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'bajista',
      levels: { soportes: [90], resistencias: [104] },
      atr: 1,
    });
    expect(r.signal).toBe('sell');
    expect(r.entry_type).toBe('limit');
    expect(r.entrada).toBe(104);
  });

  it('hold tiene entry_type null', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'lateral',
      levels: { soportes: [98], resistencias: [102] },
      atr: 1,
    });
    expect(r.entry_type).toBeNull();
  });
});

describe('computeOperativa — tendencia lateral', () => {
  it('lateral → hold (no toma sesgo)', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'lateral',
      levels: { soportes: [98], resistencias: [102] },
      atr: 1,
    });
    expect(r.signal).toBe('hold');
  });
});

describe('horizonte — derivado del span temporal', () => {
  it('intradía si span < 7 días', () => {
    // 8 velas hora a hora = 8/24 ≈ 0.33 días
    const candles = Array.from({ length: 8 }, (_, i) => ({
      t: i * 3600,
      o: 100,
      h: 100.5,
      l: 99.5,
      c: 100,
      v: 1000,
    }));
    const r = computeOperativa({
      candles,
      tendencia: 'alcista',
      levels: { soportes: [98], resistencias: [110] },
      atr: 1,
    });
    expect(r.horizonte).toBe('intradia');
  });

  it('swing si span entre 7 y 90 días', () => {
    // 30 velas diarias = 30 días
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [98], resistencias: [110] },
      atr: 1,
    });
    expect(r.horizonte).toBe('swing');
  });

  it('posicional si span >90 días', () => {
    const r = computeOperativa({
      candles: flatPrice(120, 100),
      tendencia: 'alcista',
      levels: { soportes: [98], resistencias: [110] },
      atr: 1,
    });
    expect(r.horizonte).toBe('posicional');
  });
});

describe('determinismo', () => {
  it('mismo input → mismo output, incluyendo niveles redondeados', () => {
    const candles = flatPrice(30, 100.123);
    const input = {
      candles,
      tendencia: 'alcista' as const,
      levels: { soportes: [98.456], resistencias: [110.789] },
      atr: 1.5,
    };
    expect(computeOperativa(input)).toEqual(computeOperativa(input));
  });
});
