/**
 * Tests del consolidador POST /api/agents/a4.
 * Mockea los gates + auth + narrateA4 (LLM). computeConfluence corre real
 * (determinístico). Verifica gates, validación, regla "no_agents" y que
 * narrateA4 recibe la confluencia calculada.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeRequest, makeSupabaseMock, type SupabaseMock } from '@/test/helpers/route';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>();
  return { ...actual, checkSameOrigin: vi.fn(), rateLimitByIP: vi.fn() };
});
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/agents/a4/narrate', () => ({ narrateA4: vi.fn() }));

import { POST } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import { narrateA4 } from '@/agents/a4/narrate';
import { NextResponse } from 'next/server';

const URL = 'http://localhost:3000/api/agents/a4';

// A1Output válido mínimo (pasa el schema strict de shared/types).
const VALID_A1 = {
  ticker: 'AAPL',
  asset_type: 'equity',
  price: { current: 100, change_pct_24h: 1, change_pct_7d: 2, currency: 'USD' },
  fundamentals: {
    per: null,
    peg: null,
    ev_ebitda: null,
    fcf_yield_pct: null,
    dividend_yield_pct: null,
    market_cap_usd: null,
  },
  news: [],
  anomaly_detected: false,
  anomaly_type: null,
  anomaly_description: '',
  confidence: 50,
  narrative: 'Narrativa de prueba suficientemente larga para A1.',
};

let supa: SupabaseMock;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkSameOrigin).mockReturnValue(null);
  vi.mocked(rateLimitByIP).mockResolvedValue(null);
  supa = makeSupabaseMock({ user: { id: 'user-1' } });
  vi.mocked(createSupabaseServer).mockResolvedValue(supa.client as never);
  vi.mocked(narrateA4).mockResolvedValue({
    ticker: 'AAPL',
    direccion: 'neutral',
    confianza: 'baja',
  } as never);
});

describe('POST /api/agents/a4 (consolidador)', () => {
  it('200: re-narra A4 con la confluencia calculada', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL', a1: VALID_A1, a2: null, a3: null } }));
    expect(res.status).toBe(200);
    expect((await res.json()).a4).toMatchObject({ direccion: 'neutral' });
    // narrateA4 recibe (un solo arg) ticker + la confluencia determinística
    expect(vi.mocked(narrateA4)).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'AAPL',
        confluence: expect.objectContaining({ score_total_pct: expect.any(Number) }),
      })
    );
  });

  it('403 si CSRF bloquea (sin tocar auth)', async () => {
    vi.mocked(checkSameOrigin).mockReturnValue(
      NextResponse.json({ error: 'csrf_blocked' }, { status: 403 })
    );
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL', a1: VALID_A1, a2: null, a3: null } }));
    expect(res.status).toBe(403);
    expect(supa.auth.getUser).not.toHaveBeenCalled();
  });

  it('401 si no hay usuario', async () => {
    supa.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL', a1: VALID_A1, a2: null, a3: null } }));
    expect(res.status).toBe(401);
    expect(vi.mocked(narrateA4)).not.toHaveBeenCalled();
  });

  it('400 no_agents si a1/a2/a3 son todos null', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL', a1: null, a2: null, a3: null } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_agents');
    expect(vi.mocked(narrateA4)).not.toHaveBeenCalled();
  });

  it('400 si el body no valida (ticker inválido)', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: '', a1: null, a2: null, a3: null } }));
    expect(res.status).toBe(400);
  });
});
