/**
 * Tests del cron /api/cron/watchlist-scan (plan de precisión 2026-09 · R4/R6/R13).
 *
 * Mockea Supabase admin (harness de rutas) y lib/pipeline-runner (runForUser +
 * hasRecentAnalysis). Solo se fakea `Date` (no los timers) para controlar el
 * reloj del presupuesto y el día de la semana sin tocar promesas.
 *
 *   - R4: runForUser recibe { a2TimeoutMs: 45_000 }.
 *   - R6: presupuesto agotado → el ticker que no cabe y los restantes salen como
 *     `skipped_budget`, sin llamar a runForUser.
 *   - R13: sábado UTC + SPY → `skipped_weekend`; sábado + BTC → `analyzed`;
 *     WATCHLIST_SCAN_SKIP_WEEKEND=0 desactiva el skip.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeRequest, makeBuilder, makeSupabaseMock } from '@/test/helpers/route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/pipeline-runner', () => ({ runForUser: vi.fn(), hasRecentAnalysis: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { GET } from '../route';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { runForUser, hasRecentAnalysis } from '@/lib/pipeline-runner';

const SECRET = 'test-secret';
// 2026-09-11 es viernes; 2026-09-12 sábado. Hora del cron: 21:30 UTC.
const FRIDAY = Date.UTC(2026, 8, 11, 21, 30);
const SATURDAY = Date.UTC(2026, 8, 12, 21, 30);

function req(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return makeRequest('http://localhost/api/cron/watchlist-scan', { method: 'GET', headers });
}

function mountAdmin(tickers: string[]) {
  const watchlists = makeBuilder({ then: { data: [{ id: 'wl-1', user_id: 'u-1' }], error: null } });
  const watchlist_items = makeBuilder({
    then: { data: tickers.map((ticker, position) => ({ ticker, position })), error: null },
  });
  const mock = makeSupabaseMock({ builders: { watchlists, watchlist_items } });
  vi.mocked(createSupabaseAdmin).mockReturnValue(mock.client as never);
}

function okOutcome(tokens = 10) {
  return { ok: true as const, analysis_id: 'an-1', result: {} as never, tokens_used: tokens };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: FRIDAY });
  process.env.CRON_SECRET = SECRET;
  delete process.env.WATCHLIST_SCAN_SKIP_WEEKEND;
  vi.mocked(hasRecentAnalysis).mockResolvedValue(false);
  vi.mocked(runForUser).mockResolvedValue(okOutcome());
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
  delete process.env.WATCHLIST_SCAN_SKIP_WEEKEND;
});

describe('watchlist-scan · auth', () => {
  it('401 con Bearer incorrecto (no toca DB)', async () => {
    mountAdmin(['SPY']);
    const res = await GET(req({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
});

describe('watchlist-scan · día laborable', () => {
  it('sanity: las fechas fijas son viernes y sábado UTC', () => {
    expect(new Date(FRIDAY).getUTCDay()).toBe(5);
    expect(new Date(SATURDAY).getUTCDay()).toBe(6);
  });

  it('R4: analiza cada ticker con a2TimeoutMs=45_000', async () => {
    mountAdmin(['SPY', 'QQQ']);
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.analyzed).toBe(2);
    expect(body.skipped_weekend).toBe(0);
    expect(body.skipped_budget).toBe(0);
    expect(body.weekend_mode).toBe(false);
    expect(runForUser).toHaveBeenCalledTimes(2);
    expect(runForUser).toHaveBeenCalledWith('u-1', 'SPY', { a2TimeoutMs: 45_000 });
    expect(runForUser).toHaveBeenCalledWith('u-1', 'QQQ', { a2TimeoutMs: 45_000 });
  });

  it('análisis reciente → skipped_recent sin llamar a runForUser', async () => {
    mountAdmin(['SPY']);
    vi.mocked(hasRecentAnalysis).mockResolvedValue(true);
    const body = await (await GET(req())).json();
    expect(body.skipped_recent).toBe(1);
    expect(body.analyzed).toBe(0);
    expect(runForUser).not.toHaveBeenCalled();
  });
});

describe('watchlist-scan · presupuesto de tiempo (R6)', () => {
  it('cuando no cabe otra corrida → skipped_budget para ese ticker y los restantes', async () => {
    mountAdmin(['SPY', 'QQQ', 'AAPL', 'MSFT']);
    // Cada corrida "consume" 100s de reloj: 0→100k (cabe), 100k→200k (cabe),
    // 200k+75k > 240k → corte; el 4º ni siquiera consulta hasRecentAnalysis.
    vi.mocked(runForUser).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 100_000);
      return okOutcome();
    });

    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.analyzed).toBe(2);
    expect(body.skipped_budget).toBe(2);
    expect(body.budget_cut).toBe(true);
    expect(runForUser).toHaveBeenCalledTimes(2);
    expect(hasRecentAnalysis).toHaveBeenCalledTimes(3);
    const outcomes = body.results.map((r: { ticker: string; outcome: string }) => [r.ticker, r.outcome]);
    expect(outcomes).toEqual([
      ['SPY', 'analyzed'],
      ['QQQ', 'analyzed'],
      ['AAPL', 'skipped_budget'],
      ['MSFT', 'skipped_budget'],
    ]);
  });

  it('con tiempo de sobra no corta nada', async () => {
    mountAdmin(['SPY', 'QQQ', 'AAPL']);
    const body = await (await GET(req())).json();
    expect(body.analyzed).toBe(3);
    expect(body.skipped_budget).toBe(0);
    expect(body.budget_cut).toBe(false);
  });
});

describe('watchlist-scan · fin de semana (R13)', () => {
  it('sábado + SPY → skipped_weekend; sábado + BTC → analyzed', async () => {
    vi.setSystemTime(SATURDAY);
    mountAdmin(['SPY', 'BTC-USD']);
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.weekend_mode).toBe(true);
    expect(body.skipped_weekend).toBe(1);
    expect(body.analyzed).toBe(1);
    expect(runForUser).toHaveBeenCalledTimes(1);
    expect(runForUser).toHaveBeenCalledWith('u-1', 'BTC-USD', { a2TimeoutMs: 45_000 });
    // El skip de fin de semana va ANTES de la consulta de "recent": no toca DB.
    expect(hasRecentAnalysis).toHaveBeenCalledTimes(1);
    expect(hasRecentAnalysis).toHaveBeenCalledWith('u-1', 'BTC-USD', expect.any(Number));
    const outcomes = body.results.map((r: { ticker: string; outcome: string }) => [r.ticker, r.outcome]);
    expect(outcomes).toEqual([
      ['SPY', 'skipped_weekend'],
      ['BTC-USD', 'analyzed'],
    ]);
  });

  it('WATCHLIST_SCAN_SKIP_WEEKEND=0 → sábado + SPY se analiza igualmente', async () => {
    vi.setSystemTime(SATURDAY);
    process.env.WATCHLIST_SCAN_SKIP_WEEKEND = '0';
    mountAdmin(['SPY']);
    const body = await (await GET(req())).json();
    expect(body.weekend_mode).toBe(false);
    expect(body.skipped_weekend).toBe(0);
    expect(body.analyzed).toBe(1);
    expect(runForUser).toHaveBeenCalledWith('u-1', 'SPY', { a2TimeoutMs: 45_000 });
  });

  it('WATCHLIST_SCAN_SKIP_WEEKEND=false (case-insensitive) también lo desactiva', async () => {
    vi.setSystemTime(SATURDAY);
    process.env.WATCHLIST_SCAN_SKIP_WEEKEND = 'FALSE';
    mountAdmin(['SPY']);
    const body = await (await GET(req())).json();
    expect(body.skipped_weekend).toBe(0);
    expect(body.analyzed).toBe(1);
  });

  it('viernes → no hay modo fin de semana aunque el env esté en default', async () => {
    mountAdmin(['SPY']);
    const body = await (await GET(req())).json();
    expect(body.weekend_mode).toBe(false);
    expect(body.analyzed).toBe(1);
  });
});
