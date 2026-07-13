/**
 * Tests de buildAnalysesLogRow (lib/pipeline-runner.ts) — SSOT del shape de la
 * fila de analyses_log, compartido por /api/agents/run y el cron watchlist-scan.
 *
 * Regresión que bloquea: el insert del cron había divergido y NO persistía los
 * ejes Fase 1 (net_pct/kappa/actionable_pct), dejando esas filas fuera de los
 * buckets by_actionable/by_kappa de /api/metrics/calibration.
 */

import { describe, it, expect } from 'vitest';
import { buildAnalysesLogRow } from '../pipeline-runner';
import type { RunADAMResult } from '@/agents/pipeline';

const result = {
  output: {
    direccion: 'positivo',
    confianza: 'alta',
    confluence: { score_total_pct: 72, net_pct: 40, kappa: 0.8, actionable_pct: 55 },
  },
  meta: { durationMs: 12345, traceId: 't', failures: [], debateRan: false },
  intermediates: { a1: { x: 1 }, a2: null, a3: { y: 2 }, debate: null },
} as unknown as RunADAMResult;

const base = { userId: 'u1', ticker: 'AAPL', usages: [], tokensUsed: 100, currentPrice: 190 };

describe('buildAnalysesLogRow', () => {
  it('incluye los ejes Fase 1 (net_pct/kappa/actionable_pct)', () => {
    const row = buildAnalysesLogRow({ ...base, result });
    expect(row.net_pct).toBe(40);
    expect(row.kappa).toBe(0.8);
    expect(row.actionable_pct).toBe(55);
  });

  it('mapea escalares e intermediates', () => {
    const row = buildAnalysesLogRow({ ...base, result });
    expect(row.user_id).toBe('u1');
    expect(row.ticker).toBe('AAPL');
    expect(row.confluence_pct).toBe(72);
    expect(row.direction).toBe('positivo');
    expect(row.confidence).toBe('alta');
    expect(row.a1_output).toEqual({ x: 1 });
    expect(row.latency_ms).toBe(12345);
    expect(row.initial_price).toBe(190);
    expect(row.tokens_used).toBe(100);
  });

  it('ejes → null cuando computeConfluence no los emite (fila vieja)', () => {
    const legacy = {
      ...result,
      output: { ...result.output, confluence: { score_total_pct: 50 } },
    } as unknown as RunADAMResult;
    const row = buildAnalysesLogRow({ ...base, result: legacy });
    expect(row.net_pct).toBeNull();
    expect(row.kappa).toBeNull();
    expect(row.actionable_pct).toBeNull();
  });
});
