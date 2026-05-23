import { describe, expect, it } from 'vitest';
import { buildRow } from '../build-row';
import type { RpcRadarRow_t } from '../types';

const NOW = new Date('2026-05-23T12:00:00Z');

function mkRpcRow(overrides: Partial<RpcRadarRow_t> = {}): RpcRadarRow_t {
  return {
    item_id: '00000000-0000-0000-0000-000000000001',
    watchlist_id: '00000000-0000-0000-0000-0000000000aa',
    ticker: 'AAPL',
    asset_type: 'equity',
    position: 0,
    notes: null,
    added_at: '2026-05-01T00:00:00Z',
    latest_analysis: null,
    previous_analysis: null,
    latest_unacked_signal: null,
    ...overrides,
  };
}

const latestRaw = {
  id: '00000000-0000-0000-0000-000000000010',
  created_at: '2026-05-23T11:00:00Z',
  confluence_pct: 65,
  direction: 'positivo',
  confidence: 'alta',
  a1_output: { anomaly_detected: true, anomaly_type: 'oportunidad' },
  a3_output: {
    operativa: { signal: 'buy', entrada: 100, stop_loss: 95, target: 115, ratio_riesgo_beneficio: 3 },
  },
  a4_output: { accion_sugerida: 'Comprar con stop bajo el soporte' },
};

const previousRaw = {
  ...latestRaw,
  id: '00000000-0000-0000-0000-000000000011',
  created_at: '2026-05-22T11:00:00Z',
  confluence_pct: 50,
  direction: 'neutral',
  a1_output: { anomaly_detected: false },
  a3_output: { operativa: { signal: 'hold' } },
};

describe('buildRow', () => {
  it('row sin análisis ni signal → latest null, delta vacío, stale true', () => {
    const r = buildRow(mkRpcRow(), null, NOW);
    expect(r.latest).toBeNull();
    expect(r.delta.has_previous).toBe(false);
    expect(r.distances).toBeNull();
    expect(r.signal).toBeNull();
    expect(r.is_stale).toBe(true);
  });

  it('row con latest fresh (hace 1h) → is_stale false', () => {
    const r = buildRow(
      mkRpcRow({ latest_analysis: latestRaw }),
      { current: 100, change_pct_24h: 0 },
      NOW
    );
    expect(r.latest).not.toBeNull();
    expect(r.is_stale).toBe(false);
  });

  it('row con latest hace 48h → is_stale true', () => {
    const old = { ...latestRaw, created_at: '2026-05-21T00:00:00Z' };
    const r = buildRow(
      mkRpcRow({ latest_analysis: old }),
      { current: 100, change_pct_24h: 0 },
      NOW
    );
    expect(r.is_stale).toBe(true);
  });

  it('row con latest + previous → delta computado', () => {
    const r = buildRow(
      mkRpcRow({ latest_analysis: latestRaw, previous_analysis: previousRaw }),
      { current: 100, change_pct_24h: 0 },
      NOW
    );
    expect(r.delta.has_previous).toBe(true);
    expect(r.delta.confluence_delta_pct).toBe(15);
    expect(r.delta.direction_flipped).toBe(true);
    expect(r.delta.a3_signal_flipped).toBe(true);
    expect(r.delta.anomaly_new).toBe(true);
  });

  it('row con quote → distancias calculadas', () => {
    const r = buildRow(
      mkRpcRow({ latest_analysis: latestRaw }),
      { current: 100, change_pct_24h: 0 },
      NOW
    );
    expect(r.distances).not.toBeNull();
    expect(r.distances!.to_entry_pct).toBe(0);
    expect(r.distances!.actionable).toBe(true);
  });

  it('row sin quote pero con latest → distancias con R/B pero sin %', () => {
    const r = buildRow(
      mkRpcRow({ latest_analysis: latestRaw }),
      null,
      NOW
    );
    expect(r.distances).not.toBeNull();
    expect(r.distances!.to_entry_pct).toBeNull();
    expect(r.distances!.risk_reward).toBe(3);
    expect(r.distances!.actionable).toBe(false);
  });

  it('row con signal unacked → propagada al row', () => {
    const sig = {
      id: '00000000-0000-0000-0000-000000000100',
      level: 'urgente',
      timeframe: '1D',
      setup_detected: 'rotura de resistencia con volumen',
      confidence_pct: 80,
      emitted_at: '2026-05-23T11:30:00Z',
    };
    const r = buildRow(
      mkRpcRow({ latest_unacked_signal: sig }),
      null,
      NOW
    );
    expect(r.signal).not.toBeNull();
    expect(r.signal!.level).toBe('urgente');
  });
});
