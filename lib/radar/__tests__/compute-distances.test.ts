import { describe, expect, it } from 'vitest';
import { computeDistances } from '../compute-distances';
import type { RadarAnalysisSnapshot_t } from '../types';

function mk(overrides: Partial<RadarAnalysisSnapshot_t> = {}): RadarAnalysisSnapshot_t {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    created_at: '2026-05-23T12:00:00Z',
    confluence_pct: 60,
    direction: 'positivo',
    confidence: 'media',
    a3_signal: 'buy',
    a3_entry: 100,
    a3_stop: 95,
    a3_target: 115,
    a3_risk_reward: 3,
    a1_anomaly_detected: false,
    a1_anomaly_type: null,
    a1_anomaly_description: null,
    headline: 'comprar entrada 100 stop 95 target 115',
    ...overrides,
  };
}

describe('computeDistances', () => {
  it('latest=null → todo null + actionable false', () => {
    const r = computeDistances(null, 100);
    expect(r.to_entry_pct).toBeNull();
    expect(r.to_stop_pct).toBeNull();
    expect(r.to_target_pct).toBeNull();
    expect(r.risk_reward).toBeNull();
    expect(r.actionable).toBe(false);
  });

  it('current=null → todo null pero conserva R/B del setup', () => {
    const r = computeDistances(mk(), null);
    expect(r.to_entry_pct).toBeNull();
    expect(r.risk_reward).toBe(3);
    expect(r.actionable).toBe(false);
  });

  it('current EN entrada → toEntry=0 + actionable true', () => {
    const r = computeDistances(mk(), 100);
    expect(r.to_entry_pct).toBe(0);
    expect(r.actionable).toBe(true);
  });

  it('current 1% por encima de entrada → actionable true (dentro de ±2%)', () => {
    const r = computeDistances(mk(), 101);
    expect(r.to_entry_pct).toBeCloseTo(1, 5);
    expect(r.actionable).toBe(true);
  });

  it('current 3% por encima de entrada → actionable false (fuera de ±2%)', () => {
    const r = computeDistances(mk(), 103);
    expect(r.to_entry_pct).toBeCloseTo(3, 5);
    expect(r.actionable).toBe(false);
  });

  it('señal positiva: a stop 95, current 100 → +5.26%', () => {
    const r = computeDistances(mk(), 100);
    expect(r.to_stop_pct).toBeCloseTo(((100 - 95) / 95) * 100, 5);
  });

  it('a target 115, current 100 → -13.04%', () => {
    const r = computeDistances(mk(), 100);
    expect(r.to_target_pct).toBeCloseTo(((100 - 115) / 115) * 100, 5);
  });

  it('entrada/stop/target null → distancias null pero R/B se conserva', () => {
    const r = computeDistances(
      mk({ a3_entry: null, a3_stop: null, a3_target: null, a3_risk_reward: 2.5 }),
      100
    );
    expect(r.to_entry_pct).toBeNull();
    expect(r.to_stop_pct).toBeNull();
    expect(r.to_target_pct).toBeNull();
    expect(r.risk_reward).toBe(2.5);
    expect(r.actionable).toBe(false);
  });

  it('current negativo o cero → distancias null (defensive)', () => {
    const r = computeDistances(mk(), 0);
    expect(r.to_entry_pct).toBeNull();
    expect(r.actionable).toBe(false);
  });

  it('determinismo: mismo input → mismo output', () => {
    const r1 = computeDistances(mk(), 100);
    const r2 = computeDistances(mk(), 100);
    expect(r1).toEqual(r2);
  });
});
