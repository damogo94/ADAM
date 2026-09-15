/**
 * Tests de lib/pipeline-runner.ts.
 *
 * 1) buildAnalysesLogRow — SSOT del shape de la fila de analyses_log, compartido
 *    por /api/agents/run y el cron watchlist-scan. Regresión que bloquea: el
 *    insert del cron había divergido y NO persistía los ejes Fase 1
 *    (net_pct/kappa/actionable_pct), dejando esas filas fuera de los buckets
 *    by_actionable/by_kappa de /api/metrics/calibration.
 *
 * 2) runForUser — reenvía `a2TimeoutMs` a runADAM tal cual (R4): el cron
 *    watchlist-scan es el único sitio donde A2 se narra inline con 45s, y si
 *    la opción se perdiera por el camino A2 volvería a fallar a 25s en ~87%
 *    de las filas del cron.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeBuilder, makeSupabaseMock } from '@/test/helpers/route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/market/snapshot', () => ({ buildMarketSnapshot: vi.fn() }));
vi.mock('@/agents/pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agents/pipeline')>();
  return { ...actual, runADAM: vi.fn() };
});

import { buildAnalysesLogRow, runForUser } from '../pipeline-runner';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { buildMarketSnapshot } from '@/lib/market/snapshot';
import { runADAM, type RunADAMResult } from '@/agents/pipeline';

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

describe('runForUser · reenvía a2TimeoutMs a runADAM (R4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildMarketSnapshot).mockResolvedValue({
      ok: true,
      data: { snapshot: { ticker: 'AAPL' }, currentPrice: 190 },
    } as never);
    vi.mocked(runADAM).mockResolvedValue(result);
    const analyses_log = makeBuilder({ single: { data: { id: 'an-1' }, error: null } });
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      makeSupabaseMock({ builders: { analyses_log } }).client as never
    );
  });

  it('con a2TimeoutMs → runADAM recibe exactamente esa opción', async () => {
    const out = await runForUser('u1', 'AAPL', { a2TimeoutMs: 45_000 });
    expect(out.ok).toBe(true);
    expect(runADAM).toHaveBeenCalledOnce();
    const opts = vi.mocked(runADAM).mock.calls[0]?.[2];
    expect(opts).toMatchObject({ a2TimeoutMs: 45_000 });
    // No activa skipA2Narrate: el cron SÍ narra A2 inline (no hay lambda paralelo).
    expect(opts).not.toHaveProperty('skipA2Narrate');
  });

  it('sin opciones → runADAM no recibe la clave a2TimeoutMs (default de narrateA2)', async () => {
    await runForUser('u1', 'AAPL');
    const opts = vi.mocked(runADAM).mock.calls[0]?.[2];
    expect(opts).toBeDefined();
    expect(opts).not.toHaveProperty('a2TimeoutMs');
  });
});
