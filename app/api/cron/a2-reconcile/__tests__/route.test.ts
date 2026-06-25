/**
 * Tests del cron /api/cron/a2-reconcile (gap de A2 · server-side).
 *
 * Mockea Supabase admin (harness de rutas), narrateA2, getMacroSnapshot y el
 * helper consolidateAndPersistA4. Verifica las dos fases sin pegarle a la red:
 *   - PRE-WARM: narra A2 una vez por ticker DISTINTO de watchlist (dedupe).
 *   - BACKFILL: por cada fila null-A2 reciente con A3 válido, narra A2 y llama
 *     al consolidador con analysisId + userId (persistencia server-side);
 *     una fila con A3 inválido se SALTA (no se consolida).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeRequest, makeBuilder, makeSupabaseMock } from '@/test/helpers/route';
import type { A3Output_t } from '@/agents/shared/types';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/agents/a2/narrate', () => ({ narrateA2: vi.fn() }));
vi.mock('@/lib/market/macro', () => ({ getMacroSnapshot: vi.fn() }));
vi.mock('@/agents/a4/consolidate', () => ({ consolidateAndPersistA4: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { GET } from '../route';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { narrateA2 } from '@/agents/a2/narrate';
import { getMacroSnapshot } from '@/lib/market/macro';
import { consolidateAndPersistA4 } from '@/agents/a4/consolidate';

const SECRET = 'test-secret';

const VALID_A3: A3Output_t = {
  ticker: 'AAPL',
  timeframes_analizados: ['1D'],
  tendencia: { primaria: 'lateral', secundaria: 'lateral', fuerza: 1 },
  soportes: [],
  resistencias: [],
  patron_detectado: null,
  medias: { sma20: null, sma50: null, sma200: null, vwap: null, golden_cross: false, death_cross: false },
  volumen: { estado: 'estable', comentario: 'volumen ok' },
  velas_relevantes: [],
  operativa: {
    signal: 'hold',
    entrada: null,
    stop_loss: null,
    target: null,
    atr_actual: null,
    ratio_riesgo_beneficio: null,
    horizonte: 'swing',
  },
  factor_invalidacion: 'factor de invalidación de prueba.',
  confidence: 50,
  narrative: 'narrativa A3 suficientemente larga para validar.',
};

function req(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return makeRequest('http://localhost/api/cron/a2-reconcile', { method: 'GET', headers });
}

function mountAdmin(opts: { watchlist?: { ticker: string }[]; backfill?: unknown[] }) {
  const watchlist_items = makeBuilder({ then: { data: opts.watchlist ?? [], error: null } });
  const analyses_log = makeBuilder({ then: { data: opts.backfill ?? [], error: null } });
  const mock = makeSupabaseMock({ builders: { watchlist_items, analyses_log } });
  vi.mocked(createSupabaseAdmin).mockReturnValue(mock.client as never);
  return { watchlist_items, analyses_log };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  vi.mocked(getMacroSnapshot).mockResolvedValue({ as_of: '2026-06-25' } as never);
  vi.mocked(narrateA2).mockResolvedValue({ opportunity_detected: false } as never);
  vi.mocked(consolidateAndPersistA4).mockResolvedValue({ direccion: 'neutral' } as never);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('a2-reconcile · auth', () => {
  it('500 si no hay CRON_SECRET', async () => {
    delete process.env.CRON_SECRET;
    mountAdmin({});
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('401 con Bearer incorrecto', async () => {
    mountAdmin({});
    const res = await GET(req({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
});

describe('a2-reconcile · pre-warm', () => {
  it('narra A2 una vez por ticker DISTINTO de watchlist (dedupe)', async () => {
    mountAdmin({ watchlist: [{ ticker: 'AAPL' }, { ticker: 'AAPL' }, { ticker: 'MSFT' }] });
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.warmed).toBe(2);
    expect(narrateA2).toHaveBeenCalledTimes(2);
    const warmedTickers = vi.mocked(narrateA2).mock.calls.map((c) => c[0]);
    expect(warmedTickers).toEqual(expect.arrayContaining(['AAPL', 'MSFT']));
  });
});

describe('a2-reconcile · backfill', () => {
  it('fila null-A2 con A3 válido → narra A2 + consolida con analysisId/userId', async () => {
    mountAdmin({
      backfill: [
        {
          id: 'an-1',
          user_id: 'u-1',
          ticker: 'AAPL',
          a1_output: null,
          a3_output: VALID_A3,
          debate_output: null,
          created_at: '2026-06-24T00:00:00Z',
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.backfilled).toBe(1);
    expect(consolidateAndPersistA4).toHaveBeenCalledTimes(1);
    expect(consolidateAndPersistA4).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL', analysisId: 'an-1', userId: 'u-1' })
    );
  });

  it('fila con A3 inválido → se salta (no consolida)', async () => {
    mountAdmin({
      backfill: [
        {
          id: 'an-bad',
          user_id: 'u-1',
          ticker: 'AAPL',
          a1_output: null,
          a3_output: { garbage: true },
          debate_output: null,
          created_at: '2026-06-24T00:00:00Z',
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.backfill_skipped).toBe(1);
    expect(body.backfilled).toBe(0);
    expect(consolidateAndPersistA4).not.toHaveBeenCalled();
  });

  it('filtra por a2_output null + a3_output no-null + ventana reciente', async () => {
    const { analyses_log } = mountAdmin({ backfill: [] });
    await GET(req());
    expect(analyses_log.is).toHaveBeenCalledWith('a2_output', null);
    expect(analyses_log.not).toHaveBeenCalledWith('a3_output', 'is', null);
    // ventana: gte('created_at', <cutoff ISO>)
    expect(analyses_log.gte).toHaveBeenCalledWith('created_at', expect.any(String));
  });
});
