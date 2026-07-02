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
  horizonteFromTarget,
  horizonteFallback,
  medianIntervalDays,
  MIN_RB_RATIO,
  MIN_CANDLES_FOR_SIGNAL,
} from '../operative';
import { flatPrice } from './fixtures';

/** Velas intradía (Δt = intervalHours) para probar el eje de temporalidad. */
function intradayCandles(n: number, intervalHours: number, price = 100) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * intervalHours * 3600,
    o: price,
    h: price * 1.005,
    l: price * 0.995,
    c: price,
    v: 1000,
  }));
}

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

describe('horizonte — derivado de la DISTANCIA AL TARGET (ADR-003, F8b)', () => {
  // Modelo random-walk: estBars = K²  (K = distancia al target en ATRs),
  // estDays = estBars · intervalDays. Con velas DIARIAS (intervalDays≈1),
  // estDays ≈ K². Umbrales: <7 intradia · [7,30) swing · ≥30 posicional.

  it('DISCRIMINA: target lejano (~10 ATR, K²=100d) → posicional', () => {
    // soporte 98 / resist 110, atr 1 → entrada 100 (market), target 110.
    // K = 10 → estDays ≈ 100 → posicional.
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [98], resistencias: [110] },
      atr: 1,
    });
    expect(r.signal).toBe('buy');
    expect(r.horizonte).toBe('posicional');
  });

  it('DISCRIMINA: target a ~5 ATR (K²=25d) → swing (no posicional)', () => {
    // soporte 99.5 (market, dist 0.5) / resist 102.5, atr 0.5 → entrada 100,
    // target 102.5. K = (102.5-100)/0.5 = 5 → estDays = 25 → swing.
    // R/B: riesgo = 100-(99.5-0.5)=1 ; beneficio = 2.5 → R/B 2.5 ✓
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [99.5], resistencias: [102.5] },
      atr: 0.5,
    });
    expect(r.signal).toBe('buy');
    expect(r.horizonte).toBe('swing');
  });

  it('DISCRIMINA: target intermedio (~3 ATR, K²≈9d) → swing', () => {
    // soporte 99 (market) / resist 103, atr 1 → entrada 100, target 103.
    // K = 3 → estDays = 9 → swing. R/B = (103-100)/(100-(99-1)) = 3/2 = 1.5 ✓
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [99], resistencias: [103] },
      atr: 1,
    });
    expect(r.signal).toBe('buy');
    expect(r.horizonte).toBe('swing');
  });

  it('YA NO todo es posicional: un buy con target cercano NO es posicional', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'alcista',
      levels: { soportes: [99], resistencias: [103] },
      atr: 1,
    });
    expect(r.horizonte).not.toBe('posicional');
  });

  it('velas intradía (4H) con target cercano → intradia', () => {
    // intervalDays = 4/24 ≈ 0.167. soporte 99.5/resist 102.5, atr 0.5 →
    // entrada 100 (market), target 102.5, K = 5 → estBars 25 → estDays ≈ 4.2 → intradia.
    const r = computeOperativa({
      candles: intradayCandles(30, 4, 100),
      tendencia: 'alcista',
      levels: { soportes: [99.5], resistencias: [102.5] },
      atr: 0.5,
    });
    expect(r.signal).toBe('buy');
    expect(r.horizonte).toBe('intradia');
  });

  it('sell con target lejano → posicional', () => {
    // resist 102 (market) / soporte 90, atr 1 → entrada 100, target 90.
    // K = 10 → posicional.
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'bajista',
      levels: { soportes: [90], resistencias: [102] },
      atr: 1,
    });
    expect(r.signal).toBe('sell');
    expect(r.horizonte).toBe('posicional');
  });
});

describe('horizonteFromTarget — unidad', () => {
  it('K≈2.6 con velas diarias → intradia (estDays<7)', () => {
    // K=2.6 → estBars=6.76 → estDays=6.76 (<7)
    expect(horizonteFromTarget(100, 102.6, 1, 1)).toBe('intradia');
  });

  it('K=4 con velas diarias → swing (estDays=16, en [7,30))', () => {
    expect(horizonteFromTarget(100, 104, 1, 1)).toBe('swing');
  });

  it('K=6 con velas diarias → posicional (estDays=36 ≥30)', () => {
    expect(horizonteFromTarget(100, 106, 1, 1)).toBe('posicional');
  });

  it('escala NO lineal: doblar la distancia cuadruplica estDays', () => {
    // K=3 → 9d (swing) ; K=6 → 36d (posicional). Modelo lineal daría 18d (swing).
    expect(horizonteFromTarget(100, 103, 1, 1)).toBe('swing');
    expect(horizonteFromTarget(100, 106, 1, 1)).toBe('posicional');
  });

  it('funciona con dirección negativa (sell): |target-entrada|', () => {
    expect(horizonteFromTarget(100, 94, 1, 1)).toBe('posicional'); // K=6
    expect(horizonteFromTarget(100, 96, 1, 1)).toBe('swing'); // K=4 → 16d
  });

  it('GUARD atr=0 → cae al fallback por intervalo (diario → swing)', () => {
    expect(horizonteFromTarget(100, 110, 0, 1)).toBe('swing');
  });

  it('GUARD atr no finito → fallback (intradía → intradia)', () => {
    expect(horizonteFromTarget(100, 110, NaN, 0.167)).toBe('intradia');
  });

  it('GUARD entrada/target no finitos → fallback', () => {
    expect(horizonteFromTarget(NaN, 110, 1, 1)).toBe('swing');
    expect(horizonteFromTarget(100, Infinity, 1, 1)).toBe('swing');
  });
});

describe('horizonteFallback — sin target, por intervalo', () => {
  it('intervalo diario (≥1) → swing (nunca posicional a ciegas)', () => {
    expect(horizonteFallback(1)).toBe('swing');
    expect(horizonteFallback(3)).toBe('swing'); // hueco de fin de semana
  });

  it('intervalo intradía (<1) → intradia', () => {
    expect(horizonteFallback(0.167)).toBe('intradia'); // 4H
    expect(horizonteFallback(0.0417)).toBe('intradia'); // 1H
  });

  it('hold sin niveles usa el fallback (velas diarias → swing)', () => {
    const r = computeOperativa({
      candles: flatPrice(30, 100),
      tendencia: 'lateral',
      levels: { soportes: [], resistencias: [] },
      atr: 1,
    });
    expect(r.signal).toBe('hold');
    expect(r.horizonte).toBe('swing');
  });

  it('hold intradía sin niveles → intradia', () => {
    const r = computeOperativa({
      candles: intradayCandles(30, 4, 100),
      tendencia: 'lateral',
      levels: { soportes: [], resistencias: [] },
      atr: 1,
    });
    expect(r.signal).toBe('hold');
    expect(r.horizonte).toBe('intradia');
  });

  it('<20 velas (hold por datos insuficientes) usa el fallback', () => {
    const r = computeOperativa({
      candles: flatPrice(10, 100),
      tendencia: 'alcista',
      levels: { soportes: [95], resistencias: [110] },
      atr: 1,
    });
    expect(r.signal).toBe('hold');
    expect(r.horizonte).toBe('swing');
  });
});

describe('medianIntervalDays — cadencia de las velas', () => {
  it('velas diarias → ≈1', () => {
    expect(medianIntervalDays(flatPrice(30, 100))).toBeCloseTo(1, 6);
  });

  it('velas 4H → ≈0.167', () => {
    expect(medianIntervalDays(intradayCandles(10, 4, 100))).toBeCloseTo(4 / 24, 6);
  });

  it('<2 velas → asume 1 (diario)', () => {
    expect(medianIntervalDays([])).toBe(1);
    expect(medianIntervalDays(flatPrice(1, 100))).toBe(1);
  });

  it('mediana resiste huecos (fin de semana) mejor que el span/N', () => {
    // 5 velas diarias + 1 hueco de 3 días → la mediana de Δt sigue siendo 1 día.
    const t = [0, 1, 2, 3, 6].map((d) => d * 86400);
    const candles = t.map((tt) => ({ t: tt, o: 100, h: 100.5, l: 99.5, c: 100, v: 1000 }));
    expect(medianIntervalDays(candles)).toBe(1);
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
