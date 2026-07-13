/**
 * Tests para extractTradeSummary (lib/analyses/trade-summary.ts) — el trade
 * PRIMARIO de A3, el que backtestea el cron `evaluate-trades`. Es el SSOT de
 * "¿este análisis genera una operación accionable?": el cron NO debe reimplementarlo.
 *
 * Cubre:
 *   - no-trade (hold / niveles no numéricos / input null) → null.
 *   - geometría degenerada o invertida (buy con target<entrada) → null (el guard
 *     que el `extractPlan` local del cron omitía).
 *   - accionable → summary con `entry_type` (market por defecto, limit explícito),
 *     source:'a3' y horizonte.
 */

import { describe, it, expect } from 'vitest';
import { extractTradeSummary } from '../trade-summary';

/** Envuelve una operativa como el `a3_output` (jsonb) que recibe el extractor. */
function a3(operativa: Record<string, unknown>) {
  return { operativa };
}

describe('extractTradeSummary — no-trade → null', () => {
  it('input null/undefined → null', () => {
    expect(extractTradeSummary(null)).toBeNull();
    expect(extractTradeSummary(undefined)).toBeNull();
  });

  it('sin operativa → null', () => {
    expect(extractTradeSummary({})).toBeNull();
  });

  it('signal="hold" → null (solo análisis)', () => {
    expect(
      extractTradeSummary(a3({ signal: 'hold', entrada: 100, stop_loss: 95, target: 110, horizonte: 'swing' }))
    ).toBeNull();
  });

  it('niveles no numéricos → null', () => {
    expect(
      extractTradeSummary(a3({ signal: 'buy', entrada: null, stop_loss: 95, target: 110, horizonte: 'swing' }))
    ).toBeNull();
  });
});

describe('extractTradeSummary — geometría incoherente → null', () => {
  it('buy con target < entrada (invertida) → null', () => {
    expect(
      extractTradeSummary(a3({ signal: 'buy', entrada: 100, stop_loss: 95, target: 90, horizonte: 'swing' }))
    ).toBeNull();
  });

  it('sell con target > entrada (invertida) → null', () => {
    expect(
      extractTradeSummary(a3({ signal: 'sell', entrada: 100, stop_loss: 105, target: 120, horizonte: 'swing' }))
    ).toBeNull();
  });

  it('stop == entrada (riesgo nulo, degenerada) → null', () => {
    expect(
      extractTradeSummary(a3({ signal: 'buy', entrada: 100, stop_loss: 100, target: 110, horizonte: 'swing' }))
    ).toBeNull();
  });
});

describe('extractTradeSummary — accionable → summary con entry_type', () => {
  it('buy market swing → summary completo con entry_type:"market" y source:"a3"', () => {
    const t = extractTradeSummary(
      a3({
        signal: 'buy',
        entry_type: 'market',
        entrada: 100,
        stop_loss: 95,
        target: 110,
        ratio_riesgo_beneficio: 2,
        horizonte: 'swing',
      })
    );
    expect(t).toEqual({
      signal: 'buy',
      entrada: 100,
      stop_loss: 95,
      target: 110,
      rb: 2,
      horizonte: 'swing',
      entry_type: 'market',
      source: 'a3',
    });
  });

  it('sell limit posicional → entry_type:"limit"', () => {
    const t = extractTradeSummary(
      a3({
        signal: 'sell',
        entry_type: 'limit',
        entrada: 100,
        stop_loss: 105,
        target: 85,
        ratio_riesgo_beneficio: 3,
        horizonte: 'posicional',
      })
    );
    expect(t?.signal).toBe('sell');
    expect(t?.entry_type).toBe('limit');
    expect(t?.horizonte).toBe('posicional');
  });

  it('entry_type ausente (output viejo) → fallback "market"', () => {
    const t = extractTradeSummary(
      a3({ signal: 'buy', entrada: 100, stop_loss: 95, target: 110, horizonte: 'swing' })
    );
    expect(t?.entry_type).toBe('market');
  });
});
