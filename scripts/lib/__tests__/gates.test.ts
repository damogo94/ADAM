import { describe, expect, it } from 'vitest';
import {
  ADR_0006_THRESHOLDS_SHA256,
  GATE_THRESHOLDS,
  anyVeto,
  applyGates,
  f1VetoRegimen,
  f2Esperando,
  f3KIncoherente,
  kTargetAtr,
  thresholdsHash,
  type GateInput,
} from '../gates';

const base: GateInput = {
  signal: 'sell',
  price: 100,
  sma200: 90,
  entry_type: 'limit',
  entrada: 104,
  target: 90,
  atr: 2,
  horizonte: 'swing',
};

describe('ADR-0006 · bloque de umbrales pre-registrado', () => {
  it('el sha256 del bloque coincide con el publicado en el ADR (cambiar un umbral exige ADR nuevo)', () => {
    expect(thresholdsHash()).toBe(ADR_0006_THRESHOLDS_SHA256);
  });

  it('las constantes de F3 derivan de las ventanas del backtest (no se eligen)', () => {
    expect(GATE_THRESHOLDS.F3.window_days).toEqual({ intradia: 30, swing: 30, posicional: 120 });
  });
});

describe('F1 · veto de régimen', () => {
  it('veta sell con precio > SMA200 y conserva sell con precio < SMA200', () => {
    expect(f1VetoRegimen({ ...base, price: 100, sma200: 90 })).toBe(true);
    expect(f1VetoRegimen({ ...base, price: 80, sma200: 90 })).toBe(false);
  });
  it('espejo: veta buy con precio < SMA200', () => {
    expect(f1VetoRegimen({ ...base, signal: 'buy', price: 80, sma200: 90 })).toBe(true);
    expect(f1VetoRegimen({ ...base, signal: 'buy', price: 100, sma200: 90 })).toBe(false);
  });
  it('SMA200 null o hold → indeterminado (null), nunca veta', () => {
    expect(f1VetoRegimen({ ...base, sma200: null })).toBeNull();
    expect(f1VetoRegimen({ ...base, signal: 'hold' })).toBeNull();
    expect(anyVeto(null, null)).toBe(false);
  });
});

describe('F2 · límite lejano', () => {
  it('veta limit a > max ATR y conserva a ≤ max', () => {
    // entrada 104, precio 100, atr 2 → 2.0 ATR exactos: NO supera 2 (>), sí supera 1.5
    expect(f2Esperando(base, 2)).toBe(false);
    expect(f2Esperando(base, 1.5)).toBe(true);
    expect(f2Esperando({ ...base, entrada: 105 }, 2)).toBe(true);
  });
  it('market / hold / ATR inválido → null', () => {
    expect(f2Esperando({ ...base, entry_type: 'market' }, 2)).toBeNull();
    expect(f2Esperando({ ...base, signal: 'hold' }, 2)).toBeNull();
    expect(f2Esperando({ ...base, atr: null }, 2)).toBeNull();
    expect(f2Esperando({ ...base, atr: 0 }, 2)).toBeNull();
  });
});

describe('F3 · K vs sqrt(ventana)', () => {
  it('K = |target − entrada| / ATR', () => {
    expect(kTargetAtr(base)).toBe(7); // |90−104|/2
  });
  it('swing: veta K > sqrt(30) ≈ 5.48; posicional: veta solo K > sqrt(120) ≈ 10.95', () => {
    expect(f3KIncoherente(base)).toBe(true); // K=7 > 5.48
    expect(f3KIncoherente({ ...base, horizonte: 'posicional' })).toBe(false); // 7 < 10.95
    expect(f3KIncoherente({ ...base, target: 94 })).toBe(false); // K=5 < 5.48
    expect(f3KIncoherente({ ...base, horizonte: 'posicional', target: 80 })).toBe(true); // K=12
  });
  it('sin ATR / sin plan → null', () => {
    expect(f3KIncoherente({ ...base, atr: null })).toBeNull();
    expect(f3KIncoherente({ ...base, signal: 'hold' })).toBeNull();
  });
});

describe('applyGates', () => {
  it('devuelve las tres marcas + sensibilidades F2 + magnitudes', () => {
    const t = applyGates(base);
    expect(t.f1).toBe(true);
    expect(t.f3).toBe(true);
    expect(t.f2).toEqual({ '1.5': true, '2': false, '3': false });
    expect(t.k).toBe(7);
    expect(t.dist_atr).toBe(2);
    expect(t.price_vs_sma200_pct).toBeCloseTo(11.111, 3);
  });
  it('no muta ni depende de nada fuera del input (pureza)', () => {
    const a = applyGates(base);
    const b = applyGates({ ...base });
    expect(a).toEqual(b);
  });
});
