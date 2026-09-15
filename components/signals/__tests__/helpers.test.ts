/**
 * Tests de los helpers de track record CMT (R9 · n por cluster).
 *
 * La regla de cluster es PROVISIONAL (CLUSTER_GAP_DAYS / CLUSTER_ENTRY_TOLERANCE_PCT
 * pendientes de fijar por el owner): los tests fijan el COMPORTAMIENTO de la regla
 * (cadena temporal + tolerancia de entrada + dirección), no los valores.
 */

import { describe, it, expect } from 'vitest';
import {
  clusterByGap,
  clusterSignals,
  computeTrackRecord,
  CLUSTER_GAP_DAYS,
  CLUSTER_ENTRY_TOLERANCE_PCT,
  type SignalWithOutcome,
} from '../helpers';

const DAY = 86_400_000;
const T0 = Date.parse('2026-06-01T21:00:00Z');

function signal(
  over: Partial<SignalWithOutcome> & { day: number; outcome?: SignalWithOutcome['outcome'] }
): SignalWithOutcome {
  const { day, outcome = null, ...rest } = over;
  return {
    id: `sig-${day}-${rest.ticker ?? 'SPY'}-${rest.entry_price ?? 100}`,
    user_id: 'u1',
    ticker: 'SPY',
    timeframe: '1D',
    level: 'atencion',
    confidence_pct: 60,
    setup_detected: 'Compra en soporte',
    invalidation_factor: 'cierre bajo soporte',
    indicators: [],
    entry_price: 100,
    stop_loss: 95,
    target_price: 110,
    risk_reward_ratio: 2,
    entry_type: 'limit',
    acknowledged_at: null,
    emitted_at: new Date(T0 + day * DAY).toISOString(),
    outcome,
    ...rest,
  };
}

function resolved(outcome: 'win' | 'loss' | 'timeout' | 'no_fill', r: number | null): SignalWithOutcome['outcome'] {
  return {
    signal_id: 'x',
    outcome,
    r_multiple: r,
    direction: null,
    entry: null,
    entry_type: null,
    evaluated_at: new Date(T0).toISOString(),
    exit_price: null,
    resolved_days: null,
    return_pct: null,
    stop_loss: null,
    target: null,
    timeframe: null,
  };
}

describe('clusterByGap · regla de cadena', () => {
  it('5 filas del mismo ticker en días 1,2,3,10,11 → 2 clusters (gap ≤3d respecto a la anterior)', () => {
    const rows = [1, 2, 3, 10, 11].map((d) => ({ ticker: 'AAPL', t: T0 + d * DAY, d }));
    const clusters = clusterByGap(rows, { keyOf: (r) => r.ticker, timeOf: (r) => r.t });
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.map((r) => r.d)).toEqual([1, 2, 3]);
    expect(clusters[1]!.map((r) => r.d)).toEqual([10, 11]);
  });

  it('la cadena no exige que TODAS las filas estén a ≤gap de la primera (1→3 = 2 días; 1,2,3,4,5 con gap 3 = 1 cluster)', () => {
    const rows = [1, 2, 3, 4, 5].map((d) => ({ t: T0 + d * DAY }));
    expect(clusterByGap(rows, { keyOf: () => 'k', timeOf: (r) => r.t })).toHaveLength(1);
  });

  it('un gap exactamente igual a CLUSTER_GAP_DAYS sigue encadenando; gap+1 rompe', () => {
    const rows = [0, CLUSTER_GAP_DAYS, CLUSTER_GAP_DAYS + CLUSTER_GAP_DAYS + 1].map((d) => ({ t: T0 + d * DAY }));
    const clusters = clusterByGap(rows, { keyOf: () => 'k', timeOf: (r) => r.t });
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toHaveLength(2);
  });

  it('claves distintas nunca se mezclan; el orden de entrada no importa (ordena por tiempo)', () => {
    const rows = [
      { k: 'A', t: T0 + 2 * DAY },
      { k: 'B', t: T0 + 1 * DAY },
      { k: 'A', t: T0 + 0 * DAY },
    ];
    const clusters = clusterByGap(rows, { keyOf: (r) => r.k, timeOf: (r) => r.t });
    expect(clusters).toHaveLength(2);
    const a = clusters.find((c) => c[0]!.k === 'A')!;
    expect(a.map((r) => r.t)).toEqual([T0, T0 + 2 * DAY]); // índice 0 = la más antigua
  });

  it('filas sin clave o sin tiempo se omiten (no se clusterizan ni rompen nada)', () => {
    const rows = [
      { k: null, t: T0 },
      { k: 'A', t: Number.NaN },
      { k: 'A', t: T0 },
    ];
    const clusters = clusterByGap(rows, { keyOf: (r) => r.k, timeOf: (r) => r.t });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(1);
  });
});

describe('clusterSignals · CMT (ticker + dirección + entrada ±1% + ≤3d)', () => {
  it('3 señales iguales en días consecutivos → 1 cluster', () => {
    const s = [signal({ day: 1 }), signal({ day: 2 }), signal({ day: 3 })];
    const clusters = clusterSignals(s);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
    expect(clusters[0]![0]!.id).toBe(s[0]!.id); // representativa = la más antigua
  });

  it('entrada fuera de ±CLUSTER_ENTRY_TOLERANCE_PCT respecto a la PRIMERA fila → cluster distinto', () => {
    const drift = 100 * (1 + (CLUSTER_ENTRY_TOLERANCE_PCT + 0.5) / 100);
    const s = [signal({ day: 1 }), signal({ day: 2, entry_price: drift, stop_loss: 96, target_price: 111 })];
    expect(clusterSignals(s)).toHaveLength(2);
  });

  it('entrada dentro de ±1% → mismo cluster', () => {
    const s = [signal({ day: 1 }), signal({ day: 2, entry_price: 100.5 })];
    expect(clusterSignals(s)).toHaveLength(1);
  });

  it('dirección distinta (geometría short vs long) → cluster distinto aunque comparta ticker y fecha', () => {
    const s = [
      signal({ day: 1 }),
      signal({ day: 1, entry_price: 100, stop_loss: 105, target_price: 90 }), // sell
    ];
    expect(clusterSignals(s)).toHaveLength(2);
  });

  it('señal sin niveles ni dirección persistida queda fuera de los clusters', () => {
    const s = [signal({ day: 1, entry_price: null, stop_loss: null, target_price: null })];
    expect(clusterSignals(s)).toHaveLength(0);
  });
});

describe('computeTrackRecord · por fila vs por cluster', () => {
  it('3 reemisiones ganadoras (+2R) → por fila 3W Σ+6R; por cluster 1 cluster 1W Σ+2R', () => {
    const s = [
      signal({ day: 1, outcome: resolved('win', 2) }),
      signal({ day: 2, outcome: resolved('win', 2) }),
      signal({ day: 3, outcome: resolved('win', 2) }),
    ];
    const t = computeTrackRecord(s);
    expect(t).toMatchObject({ win: 3, loss: 0, denom: 3, hitRate: 100, sumR: 6 });
    expect(t.clusters).toMatchObject({ n: 1, win: 1, loss: 0, timeout: 0, hitRate: 100, sumR: 2, unclustered: 0 });
    expect(t.clusters.gapDays).toBe(CLUSTER_GAP_DAYS);
    expect(t.clusters.entryTolerancePct).toBe(CLUSTER_ENTRY_TOLERANCE_PCT);
  });

  it('el cluster cuenta por su fila MÁS ANTIGUA aunque las reemisiones posteriores ganen', () => {
    const s = [
      signal({ day: 1, outcome: resolved('loss', -1) }),
      signal({ day: 2, outcome: resolved('win', 2) }),
      signal({ day: 3, outcome: resolved('win', 2) }),
    ];
    const t = computeTrackRecord(s);
    expect(t).toMatchObject({ win: 2, loss: 1, hitRate: 67, sumR: 3 });
    expect(t.clusters).toMatchObject({ n: 1, win: 0, loss: 1, hitRate: 0, sumR: -1 });
  });

  it('no_fill y filas sin outcome no entran ni por fila ni por cluster', () => {
    const s = [
      signal({ day: 1, outcome: resolved('no_fill', null) }),
      signal({ day: 2 }),
      signal({ day: 10, outcome: resolved('win', 1.5) }),
    ];
    const t = computeTrackRecord(s);
    expect(t).toMatchObject({ win: 1, noFill: 1, denom: 1, sumR: 1.5 });
    expect(t.clusters).toMatchObject({ n: 1, win: 1, sumR: 1.5 });
  });

  it('dos setups separados >3 días o en tickers distintos → clusters independientes', () => {
    const s = [
      signal({ day: 1, outcome: resolved('win', 2) }),
      signal({ day: 2, outcome: resolved('win', 2) }),
      signal({ day: 10, outcome: resolved('loss', -1) }),
      signal({ day: 10, ticker: 'QQQ', outcome: resolved('timeout', 0.2) }),
    ];
    const t = computeTrackRecord(s);
    expect(t.clusters).toMatchObject({ n: 3, win: 1, loss: 1, timeout: 1, hitRate: 33 });
    expect(t.clusters.sumR).toBeCloseTo(1.2);
  });

  it('sin señales → todo vacío y sin NaN', () => {
    const t = computeTrackRecord([]);
    expect(t.hitRate).toBeNull();
    expect(t.sumR).toBeNull();
    expect(t.clusters).toMatchObject({ n: 0, hitRate: null, sumR: null, unclustered: 0 });
  });
});
