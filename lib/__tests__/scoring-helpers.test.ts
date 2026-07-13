/**
 * Tests de los helpers de scoring compartidos (lib/scoring.ts) que antes vivían
 * duplicados en el cron `evaluate-signals` y en `/api/metrics/calibration`.
 *
 * El de extractAtrPct documenta el CAMBIO DE COMPORTAMIENTO de la unificación:
 * la calibración pasa a usar este walker tolerante (como el cron) en vez de
 * `A3Output.safeParse` estricto, así que un a3_output legacy que traiga el ATR
 * pero no pase el parse completo YA da umbral ATR en ambos lados (antes: 2% fijo
 * en calibración vs ATR en el cron → incomparabilidad).
 */

import { describe, it, expect } from 'vitest';
import {
  dbToScoringDirection,
  extractAtrPct,
  volatilityThresholdPct,
  SIGNAL_THRESHOLD_PCT,
  SIGNAL_ATR_K,
} from '../scoring';

describe('dbToScoringDirection', () => {
  it('mapea el enum DB al vocabulario de scoring', () => {
    expect(dbToScoringDirection('positivo')).toBe('alcista');
    expect(dbToScoringDirection('negativo')).toBe('bajista');
    expect(dbToScoringDirection('neutral')).toBe('neutral');
  });
  it('desconocido → neutral (defensivo)', () => {
    expect(dbToScoringDirection('loquesea')).toBe('neutral');
  });
});

describe('extractAtrPct — walker tolerante', () => {
  it('lee operativa.atr_actual y lo normaliza por el precio (ATR%)', () => {
    expect(extractAtrPct({ operativa: { atr_actual: 4 } }, 200)).toBe(2); // 4/200*100
  });

  it('a3_output legacy parcial (solo operativa.atr_actual, sin schema completo) → SÍ da ATR%', () => {
    // Este es el caso del cambio de comportamiento: A3Output.safeParse fallaría
    // aquí, pero el walker extrae el ATR igual → umbral ATR, no 2% fijo.
    expect(extractAtrPct({ operativa: { atr_actual: 3 }, campo_raro: true }, 100)).toBe(3);
  });

  it('null/no-objeto, ATR ausente/≤0, o precio ≤0 → null', () => {
    expect(extractAtrPct(null, 100)).toBeNull();
    expect(extractAtrPct({ operativa: {} }, 100)).toBeNull();
    expect(extractAtrPct({ operativa: { atr_actual: 0 } }, 100)).toBeNull();
    expect(extractAtrPct({ operativa: { atr_actual: 4 } }, 0)).toBeNull();
  });
});

describe('volatilityThresholdPct — max(piso, k·ATR%)', () => {
  it('atrPct null → piso fijo', () => {
    expect(volatilityThresholdPct(null)).toBe(SIGNAL_THRESHOLD_PCT);
  });
  it('ATR% por debajo del piso → piso', () => {
    expect(volatilityThresholdPct(1)).toBe(SIGNAL_THRESHOLD_PCT); // 1 < 2
  });
  it('ATR% por encima del piso → k·ATR%', () => {
    expect(volatilityThresholdPct(4)).toBe(SIGNAL_ATR_K * 4);
  });
});
