import { describe, expect, it } from 'vitest';
import { computeDelta } from '../compute-delta';
import type { RadarAnalysisSnapshot_t } from '../types';

function mkSnapshot(overrides: Partial<RadarAnalysisSnapshot_t> = {}): RadarAnalysisSnapshot_t {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    created_at: '2026-05-23T12:00:00Z',
    confluence_pct: 50,
    direction: 'neutral',
    confidence: 'media',
    a3_signal: 'hold',
    a3_entry: null,
    a3_stop: null,
    a3_target: null,
    a3_risk_reward: null,
    a1_anomaly_detected: false,
    a1_anomaly_type: null,
    a1_anomaly_description: null,
    headline: 'sin dictamen',
    ...overrides,
  };
}

describe('computeDelta', () => {
  it('latest=null → delta vacío (sin baseline ni latest)', () => {
    const r = computeDelta(null, null);
    expect(r.has_previous).toBe(false);
    expect(r.confluence_delta_pct).toBeNull();
    expect(r.direction_flipped).toBe(false);
    expect(r.a3_signal_flipped).toBe(false);
    expect(r.anomaly_new).toBe(false);
  });

  it('latest sin previous y SIN anomalía → has_previous false, anomaly_new false', () => {
    const r = computeDelta(mkSnapshot({ a1_anomaly_detected: false }), null);
    expect(r.has_previous).toBe(false);
    expect(r.anomaly_new).toBe(false);
  });

  it('latest sin previous y CON anomalía → anomaly_new true (primera vez)', () => {
    const r = computeDelta(
      mkSnapshot({ a1_anomaly_detected: true, a1_anomaly_type: 'oportunidad' }),
      null
    );
    expect(r.has_previous).toBe(false);
    expect(r.anomaly_new).toBe(true);
  });

  it('confluence_delta_pct = latest - previous', () => {
    const latest = mkSnapshot({ confluence_pct: 72 });
    const prev = mkSnapshot({ confluence_pct: 50 });
    const r = computeDelta(latest, prev);
    expect(r.confluence_delta_pct).toBe(22);
    expect(r.has_previous).toBe(true);
  });

  it('confluence puede ser negativo', () => {
    const r = computeDelta(mkSnapshot({ confluence_pct: 30 }), mkSnapshot({ confluence_pct: 70 }));
    expect(r.confluence_delta_pct).toBe(-40);
  });

  it('direction_flipped: positivo → negativo', () => {
    const r = computeDelta(
      mkSnapshot({ direction: 'positivo' }),
      mkSnapshot({ direction: 'negativo' })
    );
    expect(r.direction_flipped).toBe(true);
  });

  it('direction same → not flipped', () => {
    const r = computeDelta(
      mkSnapshot({ direction: 'positivo' }),
      mkSnapshot({ direction: 'positivo' })
    );
    expect(r.direction_flipped).toBe(false);
  });

  it('a3_signal_flipped: buy → sell', () => {
    const r = computeDelta(
      mkSnapshot({ a3_signal: 'buy' }),
      mkSnapshot({ a3_signal: 'sell' })
    );
    expect(r.a3_signal_flipped).toBe(true);
  });

  it('a3_signal_flipped: null en uno → NO es flip (degradación de cobertura, no señal real)', () => {
    const r = computeDelta(
      mkSnapshot({ a3_signal: 'buy' }),
      mkSnapshot({ a3_signal: null })
    );
    expect(r.a3_signal_flipped).toBe(false);
  });

  it('anomaly_new: previo sin anomalía + latest con anomalía → true', () => {
    const latest = mkSnapshot({ a1_anomaly_detected: true, a1_anomaly_type: 'vulnerabilidad' });
    const prev = mkSnapshot({ a1_anomaly_detected: false });
    const r = computeDelta(latest, prev);
    expect(r.anomaly_new).toBe(true);
  });

  it('anomaly_new: ambos detectan + mismo type → false (no es nueva)', () => {
    const t = 'oportunidad' as const;
    const r = computeDelta(
      mkSnapshot({ a1_anomaly_detected: true, a1_anomaly_type: t }),
      mkSnapshot({ a1_anomaly_detected: true, a1_anomaly_type: t })
    );
    expect(r.anomaly_new).toBe(false);
  });

  it('anomaly_new: ambos detectan + type CAMBIÓ → true (sentido distinto)', () => {
    const r = computeDelta(
      mkSnapshot({ a1_anomaly_detected: true, a1_anomaly_type: 'vulnerabilidad' }),
      mkSnapshot({ a1_anomaly_detected: true, a1_anomaly_type: 'oportunidad' })
    );
    expect(r.anomaly_new).toBe(true);
  });

  it('determinismo: mismo input → mismo output (idempotencia)', () => {
    const latest = mkSnapshot({ confluence_pct: 60, direction: 'positivo', a3_signal: 'buy' });
    const prev = mkSnapshot({ confluence_pct: 50, direction: 'neutral', a3_signal: 'hold' });
    const r1 = computeDelta(latest, prev);
    const r2 = computeDelta(latest, prev);
    expect(r1).toEqual(r2);
  });
});
