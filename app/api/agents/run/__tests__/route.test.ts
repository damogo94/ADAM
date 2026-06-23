/**
 * Tests del route handler POST /api/agents/run — el camino crítico
 * (auth + CSRF + rate-limit + quota + pipeline + persistencia).
 *
 * Estrategia: mockeamos las dependencias del handler (gates, supabase,
 * market data, pipeline) con factories que devuelven vi.fn() y configuramos
 * el comportamiento por test en beforeEach. No se llama a Anthropic ni a la
 * red. Verificamos orden de gates, status codes, persistencia y degradación.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  makeRequest,
  makeSupabaseMock,
  makeBuilder,
  type SupabaseMock,
  type QueryBuilderMock,
} from '@/test/helpers/route';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>();
  return { ...actual, checkSameOrigin: vi.fn(), rateLimitByIP: vi.fn() };
});

vi.mock('@/lib/ratelimit', () => ({
  limiters: { userRuns: { limit: vi.fn() } },
}));

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));

vi.mock('@/lib/market/finnhub', () => ({
  fallbackQuote: vi.fn(),
  fallbackDaily: vi.fn(),
  fallbackIntraday: vi.fn(),
  fallbackOverview: vi.fn(),
  fallbackNewsSentiment: vi.fn(),
}));
vi.mock('@/lib/market/macro', () => ({ getMacroSnapshot: vi.fn() }));

vi.mock('@/agents/pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agents/pipeline')>();
  return { ...actual, runADAM: vi.fn() };
});

import { POST } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import { limiters } from '@/lib/ratelimit';
import { runADAM, AllAgentsFailedError } from '@/agents/pipeline';
import * as finnhub from '@/lib/market/finnhub';
import { getMacroSnapshot } from '@/lib/market/macro';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

const URL = 'http://localhost:3000/api/agents/run';

function fakeResult(overrides: Record<string, unknown> = {}) {
  return {
    output: {
      ticker: 'AAPL',
      direccion: 'positivo',
      confianza: 'media',
      confluence: { score_total_pct: 62 },
    },
    intermediates: { a1: null, a2: null, a3: null, debate: null },
    meta: { traceId: 'trace-1', failures: [], debateRan: false, durationMs: 12 },
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof runADAM>>;
}

/**
 * Lee un Response NDJSON (el éxito de /run ahora es streaming) y devuelve los
 * eventos parseados. Consumir el stream también garantiza que el `start` del
 * ReadableStream (donde corre runADAM + persistencia) terminó.
 */
async function readStream(res: Response): Promise<Array<Record<string, unknown>>> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events: Array<Record<string, unknown>> = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const l of lines) if (l.trim()) events.push(JSON.parse(l));
  }
  if (buf.trim()) events.push(JSON.parse(buf));
  return events;
}

const eventOfType = (events: Array<Record<string, unknown>>, type: string) =>
  events.find((e) => e.type === type) as Record<string, unknown> | undefined;

let supa: SupabaseMock;
let adminBuilder: QueryBuilderMock;

beforeEach(() => {
  vi.clearAllMocks();

  // Gates abiertos por defecto
  vi.mocked(checkSameOrigin).mockReturnValue(null);
  vi.mocked(rateLimitByIP).mockResolvedValue(null);
  vi.mocked(limiters.userRuns.limit).mockResolvedValue({
    success: true,
    remaining: 29,
    limit: 30,
    reset: 0,
  });

  // Supabase server (auth) + admin (persistencia)
  supa = makeSupabaseMock({ user: { id: 'user-1' } });
  vi.mocked(createSupabaseServer).mockResolvedValue(supa.client as never);
  adminBuilder = makeBuilder({ then: { data: { id: 'log-1' }, error: null } });
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    from: vi.fn(() => adminBuilder),
  } as never);

  // Market data con precio válido
  vi.mocked(finnhub.fallbackQuote).mockResolvedValue({
    current: 100,
    change_pct_24h: 1.5,
    currency: 'USD',
  } as never);
  vi.mocked(finnhub.fallbackDaily).mockResolvedValue([
    { o: 1, h: 2, l: 0.5, c: 1.5, v: 10, t: 1 },
    { o: 1.5, h: 2, l: 1, c: 1.6, v: 10, t: 2 },
  ] as never);
  vi.mocked(finnhub.fallbackIntraday).mockResolvedValue([] as never);
  vi.mocked(finnhub.fallbackOverview).mockResolvedValue(null as never);
  vi.mocked(finnhub.fallbackNewsSentiment).mockResolvedValue([] as never);
  vi.mocked(getMacroSnapshot).mockResolvedValue(null as never);

  vi.mocked(runADAM).mockResolvedValue(fakeResult());
});

describe('POST /api/agents/run — gates', () => {
  it('200 streaming: emite `final` con A4 + analysis_id y persiste', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson');
    const events = await readStream(res);
    const final = eventOfType(events, 'final')!;
    expect(final).toBeDefined();
    expect(final.a4).toMatchObject({ direccion: 'positivo' });
    expect(final.partial).toBe(false);
    // Devuelve el id de la fila insertada (para que el re-narrate de A4 cierre
    // el A2 gap en persistencia).
    expect(final.analysis_id).toBe('log-1');
    // Persistencia con el contrato esperado (corre dentro del stream `start`).
    expect(adminBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        ticker: 'AAPL',
        usage_breakdown: expect.any(Array),
        initial_price: 100,
      })
    );
  });

  it('devuelve la respuesta de CSRF si checkSameOrigin bloquea', async () => {
    vi.mocked(checkSameOrigin).mockReturnValue(
      NextResponse.json({ error: 'csrf_blocked' }, { status: 403 })
    );
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(403);
    expect(vi.mocked(rateLimitByIP)).not.toHaveBeenCalled();
    expect(vi.mocked(runADAM)).not.toHaveBeenCalled();
  });

  it('devuelve la respuesta de rate-limit por IP', async () => {
    vi.mocked(rateLimitByIP).mockResolvedValue(
      NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })
    );
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(429);
    expect(vi.mocked(runADAM)).not.toHaveBeenCalled();
  });

  it('401 si no hay usuario autenticado', async () => {
    supa.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
    expect(vi.mocked(runADAM)).not.toHaveBeenCalled();
  });

  it('429 user_quota_exceeded si el límite per-user salta', async () => {
    vi.mocked(limiters.userRuns.limit).mockResolvedValue({
      success: false,
      remaining: 0,
      limit: 30,
      reset: Date.now() + 1000,
    });
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('user_quota_exceeded');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30');
  });

  it('400 si el body no valida el schema', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: '' } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid request');
  });
});

describe('POST /api/agents/run — pipeline', () => {
  it('503 market_data_unavailable sin quote ni velas', async () => {
    vi.mocked(finnhub.fallbackQuote).mockResolvedValue(null as never);
    vi.mocked(finnhub.fallbackDaily).mockResolvedValue([] as never);
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('market_data_unavailable');
    expect(vi.mocked(runADAM)).not.toHaveBeenCalled();
  });

  it('all_agents_failed → 200 con evento `fatal` en el stream', async () => {
    // Tras comprometer el 200 + empezar a streamear ya no se puede volver a un
    // status 5xx: el fallo interno viaja como evento `fatal`.
    vi.mocked(runADAM).mockRejectedValue(
      new AllAgentsFailedError([{ agent: 'A1', message: 'x' }])
    );
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(200);
    const events = await readStream(res);
    const fatal = eventOfType(events, 'fatal')!;
    expect(fatal.error).toBe('all_agents_failed');
  });

  it('pipeline_failed → evento `fatal` + captura en Sentry', async () => {
    vi.mocked(runADAM).mockRejectedValue(new Error('boom'));
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(200);
    const events = await readStream(res);
    const fatal = eventOfType(events, 'fatal')!;
    expect(fatal.error).toBe('pipeline_failed');
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled();
  });

  it('degradación parcial: `final` con partial=true y un captureMessage por fallo', async () => {
    vi.mocked(runADAM).mockResolvedValue(
      fakeResult({
        meta: {
          traceId: 't',
          failures: [{ agent: 'A2', message: 'timeout' }],
          debateRan: false,
          durationMs: 5,
        },
      })
    );
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(200);
    const events = await readStream(res);
    const final = eventOfType(events, 'final')!;
    expect(final.partial).toBe(true);
    expect(final.failures).toHaveLength(1);
    expect(vi.mocked(Sentry.captureMessage)).toHaveBeenCalledTimes(1);
  });

  it('la persistencia es best-effort: un fallo al guardar no rompe el stream', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      from: vi.fn(() => {
        throw new Error('db down');
      }),
    } as never);
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(200);
    const events = await readStream(res);
    expect(eventOfType(events, 'final')).toBeDefined();
  });

  it('normaliza el ticker a mayúsculas antes de correr el pipeline', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: 'aapl' } }));
    await readStream(res); // consume → garantiza que el `start` (runADAM) corrió
    expect(vi.mocked(runADAM)).toHaveBeenCalledWith(
      'AAPL',
      expect.objectContaining({ ticker: 'AAPL' }),
      expect.objectContaining({ skipA2Narrate: true })
    );
  });
});
