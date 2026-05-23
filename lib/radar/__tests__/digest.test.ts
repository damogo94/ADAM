import { describe, expect, it } from 'vitest';
import { buildDigest } from '../digest';
import type {
  RadarAnalysisSnapshot_t,
  RadarDelta_t,
  RadarRow_t,
  RadarSignal_t,
} from '../types';

function mkRow(overrides: Partial<RadarRow_t> = {}): RadarRow_t {
  return {
    item_id: '00000000-0000-0000-0000-000000000001',
    ticker: 'AAPL',
    asset_type: 'equity',
    position: 0,
    notes: null,
    added_at: '2026-05-01T00:00:00Z',
    quote: { current: 100, change_pct_24h: 0 },
    latest: null,
    delta: noDelta(),
    distances: null,
    signal: null,
    is_stale: false,
    ...overrides,
  };
}

function noDelta(): RadarDelta_t {
  return {
    confluence_delta_pct: null,
    direction_flipped: false,
    a3_signal_flipped: false,
    anomaly_new: false,
    has_previous: false,
  };
}

function mkLatest(overrides: Partial<RadarAnalysisSnapshot_t> = {}): RadarAnalysisSnapshot_t {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    created_at: '2026-05-23T10:00:00Z',
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

function mkSignal(level: RadarSignal_t['level']): RadarSignal_t {
  return {
    id: '00000000-0000-0000-0000-000000000100',
    level,
    timeframe: '1D',
    setup_detected: `setup ${level}`,
    confidence_pct: 80,
    emitted_at: '2026-05-23T11:00:00Z',
  };
}

describe('buildDigest', () => {
  it('lista vacía → digest vacío', () => {
    expect(buildDigest([])).toEqual([]);
  });

  it('sin signals ni cambios relevantes → digest vacío', () => {
    const rows = [mkRow({ ticker: 'AAPL' }), mkRow({ ticker: 'MSFT' })];
    expect(buildDigest(rows)).toEqual([]);
  });

  it('1 signal urgente unacked → 1 entry high', () => {
    const rows = [mkRow({ ticker: 'AAPL', signal: mkSignal('urgente') })];
    const d = buildDigest(rows);
    expect(d).toHaveLength(1);
    expect(d[0]?.source).toBe('signal');
    expect(d[0]?.severity).toBe('high');
    expect(d[0]?.ticker).toBe('AAPL');
  });

  it('signals ordenadas por severidad: urgente antes que atencion', () => {
    const rows = [
      mkRow({ ticker: 'AAPL', signal: mkSignal('atencion') }),
      mkRow({ ticker: 'MSFT', signal: mkSignal('urgente') }),
    ];
    const d = buildDigest(rows);
    expect(d.map((e) => e.ticker)).toEqual(['MSFT', 'AAPL']);
  });

  it('cap a 3 entradas', () => {
    const rows = [
      mkRow({ ticker: 'A', signal: mkSignal('urgente') }),
      mkRow({ ticker: 'B', signal: mkSignal('urgente') }),
      mkRow({ ticker: 'C', signal: mkSignal('urgente') }),
      mkRow({ ticker: 'D', signal: mkSignal('urgente') }),
    ];
    expect(buildDigest(rows)).toHaveLength(3);
  });

  it('signal manda sobre delta — el mismo ticker no se duplica', () => {
    const rows = [
      mkRow({
        ticker: 'AAPL',
        signal: mkSignal('urgente'),
        latest: mkLatest({ a1_anomaly_detected: true }),
        delta: {
          confluence_delta_pct: 30,
          direction_flipped: true,
          a3_signal_flipped: true,
          anomaly_new: true,
          has_previous: true,
        },
      }),
    ];
    const d = buildDigest(rows);
    expect(d).toHaveLength(1);
    expect(d[0]?.source).toBe('signal');
  });

  it('delta direction_flipped completa slots vacíos como high', () => {
    const rows = [
      mkRow({
        ticker: 'AAPL',
        latest: mkLatest({ direction: 'positivo' }),
        delta: {
          confluence_delta_pct: 5,
          direction_flipped: true,
          a3_signal_flipped: false,
          anomaly_new: false,
          has_previous: true,
        },
      }),
    ];
    const d = buildDigest(rows);
    expect(d).toHaveLength(1);
    expect(d[0]?.source).toBe('delta');
    expect(d[0]?.severity).toBe('high');
    expect(d[0]?.reason).toContain('dirección');
  });

  it('delta anomaly_new (sin previous) entra como high', () => {
    const rows = [
      mkRow({
        ticker: 'AAPL',
        latest: mkLatest({ a1_anomaly_detected: true, a1_anomaly_type: 'oportunidad' }),
        delta: {
          confluence_delta_pct: null,
          direction_flipped: false,
          a3_signal_flipped: false,
          anomaly_new: true,
          has_previous: false,
        },
      }),
    ];
    const d = buildDigest(rows);
    expect(d).toHaveLength(1);
    expect(d[0]?.severity).toBe('high');
    expect(d[0]?.reason).toContain('anomalía');
  });

  it('confluence delta ≥ 20 → medium, ≥ 10 → low', () => {
    const rows = [
      mkRow({
        ticker: 'A',
        delta: { ...noDelta(), confluence_delta_pct: 25, has_previous: true },
      }),
      mkRow({
        ticker: 'B',
        delta: { ...noDelta(), confluence_delta_pct: 12, has_previous: true },
      }),
      mkRow({
        ticker: 'C',
        delta: { ...noDelta(), confluence_delta_pct: 5, has_previous: true },
      }),
    ];
    const d = buildDigest(rows);
    expect(d.find((e) => e.ticker === 'A')?.severity).toBe('medium');
    expect(d.find((e) => e.ticker === 'B')?.severity).toBe('low');
    expect(d.find((e) => e.ticker === 'C')).toBeUndefined(); // <10 ignorado
  });

  it('delta high se prioriza sobre delta medium', () => {
    const rows = [
      mkRow({
        ticker: 'LOW',
        delta: { ...noDelta(), confluence_delta_pct: 25, has_previous: true },
      }),
      mkRow({
        ticker: 'HIGH',
        latest: mkLatest({ direction: 'positivo' }),
        delta: {
          ...noDelta(),
          direction_flipped: true,
          has_previous: true,
        },
      }),
    ];
    const d = buildDigest(rows);
    expect(d[0]?.ticker).toBe('HIGH');
    expect(d[1]?.ticker).toBe('LOW');
  });
});
