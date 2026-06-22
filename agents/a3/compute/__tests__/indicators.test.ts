/**
 * Tests para agents/a3/compute/indicators.ts
 *
 * Verificable matemáticamente con fixtures sintéticos.
 */

import { describe, it, expect } from 'vitest';
import {
  smaLast,
  emaLast,
  vwap,
  atrLast,
  rsiLast,
  macdLast,
  detectCrosses,
  classifyVolumeState,
  rango52Semanas,
} from '../indicators';
import { flatPrice, linearUp, linearDown } from './fixtures';

describe('smaLast', () => {
  it('flat price → SMA = ese precio', () => {
    expect(smaLast(flatPrice(50, 100), 20)).toBe(100);
  });

  it('null si no hay velas suficientes', () => {
    expect(smaLast(flatPrice(10, 100), 20)).toBeNull();
  });

  it('linearUp 100..130 con SMA20 — debe ser la media de los últimos 20 closes', () => {
    // closes: 100, 101, ..., 130 (31 velas)
    const candles = linearUp(31, 100, 1);
    const expected = (111 + 130) / 2; // promedio de 111..130 = 120.5
    expect(smaLast(candles, 20)).toBeCloseTo(expected, 2);
  });
});

describe('emaLast', () => {
  it('flat price → EMA = ese precio', () => {
    expect(emaLast(flatPrice(50, 100), 20)).toBeCloseTo(100, 5);
  });
  it('null si no hay velas suficientes', () => {
    expect(emaLast(flatPrice(5, 100), 20)).toBeNull();
  });
});

describe('vwap', () => {
  it('flat price = 100, volumen constante → VWAP = (h+l+c)/3 ≈ 100', () => {
    const v = vwap(flatPrice(10, 100));
    // typical price = (100+0.005)+(100-0.005)+100 / 3 ≈ 100
    expect(v).toBeCloseTo(100, 1);
  });

  it('null si todo el volumen es 0', () => {
    const candles = flatPrice(10, 100, 0);
    expect(vwap(candles)).toBeNull();
  });

  it('null si array vacío', () => {
    expect(vwap([])).toBeNull();
  });
});

describe('atrLast', () => {
  it('flat price → ATR muy pequeño (≈ wick width)', () => {
    const atr = atrLast(flatPrice(30, 100));
    expect(atr).not.toBeNull();
    expect(atr!).toBeLessThan(3); // wick total ~2% * 100 = 2
  });

  it('null si <period+1 velas', () => {
    expect(atrLast(flatPrice(10, 100), 14)).toBeNull();
  });

  it('linearUp con paso de 5 → ATR mayor que flat', () => {
    const atrFlat = atrLast(flatPrice(30, 100))!;
    const atrUp = atrLast(linearUp(30, 100, 5))!;
    expect(atrUp).toBeGreaterThan(atrFlat);
  });
});

describe('rsiLast', () => {
  it('linearUp constante → RSI ≈ 100 (todos los closes suben)', () => {
    const rsi = rsiLast(linearUp(50, 100, 1));
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(85);
  });

  it('linearDown constante → RSI ≈ 0', () => {
    const rsi = rsiLast(linearDown(50, 200, 1));
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeLessThan(15);
  });

  it('flat → RSI indefinido o cercano a 50, no debe romper', () => {
    const rsi = rsiLast(flatPrice(50, 100));
    // technicalindicators puede devolver 50 o NaN. Ambos OK siempre que no
    // sea undefined.
    expect(rsi).not.toBeUndefined();
  });
});

describe('macdLast', () => {
  it('null si <slow+signal velas (35 por defecto)', () => {
    expect(macdLast(linearUp(30, 100, 1))).toBeNull();
  });

  it('linearUp → MACD line > 0 (EMA rápida sobre la lenta) con las 3 componentes', () => {
    const macd = macdLast(linearUp(60, 100, 1));
    expect(macd).not.toBeNull();
    expect(macd!.line).toBeGreaterThan(0);
    expect(typeof macd!.signal).toBe('number');
    expect(typeof macd!.histograma).toBe('number');
  });

  it('linearDown → MACD line < 0', () => {
    const macd = macdLast(linearDown(60, 200, 1));
    expect(macd).not.toBeNull();
    expect(macd!.line).toBeLessThan(0);
  });
});

describe('detectCrosses', () => {
  it('no detecta cruces con <205 velas', () => {
    const r = detectCrosses(flatPrice(100, 100));
    expect(r.golden_cross).toBe(false);
    expect(r.death_cross).toBe(false);
  });

  it('flat con >250 velas: no hay cruces (SMA50 = SMA200 todo el rato)', () => {
    const r = detectCrosses(flatPrice(250, 100));
    expect(r.golden_cross).toBe(false);
    expect(r.death_cross).toBe(false);
  });

  it('detectCrosses devuelve objeto válido con los flags booleanos', () => {
    // Verificación de contrato más que comportamiento específico —
    // matemáticamente forzar un cruce limpio con fixtures sintéticos es
    // delicado porque depende del timing exacto SMA50 vs SMA200. La
    // detección de cruces en producción se valida con datos reales en
    // Fase 2 (eval harness).
    const candles = [...linearDown(150, 200, 0.5), ...linearUp(150, 125, 0.5)];
    const r = detectCrosses(candles);
    expect(typeof r.golden_cross).toBe('boolean');
    expect(typeof r.death_cross).toBe('boolean');
  });

  // Caso positivo (antes diferido a "Fase 2 eval harness"): forzamos el cruce
  // en las últimas barras con 204 velas planas (SMA50 = SMA200) + un impulso
  // corto al final. La SMA50 reacciona antes que la SMA200 y la cruza dentro
  // de la ventana de lookback. Sin esta cobertura el disparo estaba muerto en
  // prod (ventana corta) Y sin assert (los tests solo veían el caso false).
  it('golden cross: SMA50 cruza ARRIBA de SMA200 en las últimas barras → true', () => {
    const candles = [...flatPrice(204, 100), ...linearUp(3, 110, 10)];
    const r = detectCrosses(candles);
    expect(r.golden_cross).toBe(true);
    expect(r.death_cross).toBe(false);
  });

  it('death cross: SMA50 cruza ABAJO de SMA200 en las últimas barras → true', () => {
    const candles = [...flatPrice(204, 100), ...linearDown(3, 90, 10)];
    const r = detectCrosses(candles);
    expect(r.death_cross).toBe(true);
    expect(r.golden_cross).toBe(false);
  });
});

describe('classifyVolumeState', () => {
  it('flat con mismo volumen → estable', () => {
    expect(classifyVolumeState(flatPrice(50, 100, 1000))).toBe('estable');
  });

  it('volumen reciente >> baseline → creciente', () => {
    const baseline = flatPrice(20, 100, 100); // primeras 20 con vol 100
    const recent = flatPrice(5, 100, 1000); // últimas 5 con vol 1000 (10x)
    // Re-asignar t para mantener orden
    const merged = [
      ...baseline.map((c, i) => ({ ...c, t: i })),
      ...recent.map((c, i) => ({ ...c, t: 20 + i })),
    ];
    expect(classifyVolumeState(merged)).toBe('creciente');
  });

  it('volumen reciente << baseline → decreciente', () => {
    const baseline = flatPrice(20, 100, 1000);
    const recent = flatPrice(5, 100, 100); // 10x menos
    const merged = [
      ...baseline.map((c, i) => ({ ...c, t: i })),
      ...recent.map((c, i) => ({ ...c, t: 20 + i })),
    ];
    expect(classifyVolumeState(merged)).toBe('decreciente');
  });
});

describe('determinismo', () => {
  it('mismo input → mismo output, exactamente', () => {
    const candles = linearUp(50, 100, 1);
    expect(smaLast(candles, 20)).toBe(smaLast(candles, 20));
    expect(atrLast(candles, 14)).toBe(atrLast(candles, 14));
    expect(vwap(candles)).toBe(vwap(candles));
  });
});

describe('rango52Semanas', () => {
  it('null con <200 velas (histórico insuficiente para 52s)', () => {
    expect(rango52Semanas(flatPrice(150, 100))).toBeNull();
  });

  it('≥200 velas → high > low y posición dentro de [0,100]', () => {
    const r = rango52Semanas(linearUp(252, 100, 0.5));
    expect(r).not.toBeNull();
    expect(r!.high).toBeGreaterThan(r!.low);
    expect(r!.posicion_pct).toBeGreaterThanOrEqual(0);
    expect(r!.posicion_pct).toBeLessThanOrEqual(100);
  });

  it('precio cerca de máximos → posición alta', () => {
    const r = rango52Semanas([...flatPrice(200, 100), ...linearUp(20, 100, 2.5)]);
    expect(r).not.toBeNull();
    expect(r!.posicion_pct).toBeGreaterThanOrEqual(90);
  });

  it('precio cerca de mínimos → posición baja', () => {
    const r = rango52Semanas([...flatPrice(200, 100), ...linearDown(20, 100, 2.5)]);
    expect(r).not.toBeNull();
    expect(r!.posicion_pct).toBeLessThanOrEqual(10);
  });
});
