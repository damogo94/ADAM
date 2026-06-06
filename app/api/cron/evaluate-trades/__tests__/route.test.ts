/**
 * Tests del cron /api/cron/evaluate-trades (ADR-002 fase 3).
 *
 * Mockea Supabase admin (harness de rutas) y fallbackDaily; deja correr
 * evaluateTrade() de verdad (es puro) — así el test cubre el pegamento
 * cron↔motor con velas sintéticas controladas.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeRequest, makeBuilder, makeSupabaseMock, type QueryBuilderMock } from '@/test/helpers/route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/market/finnhub', () => ({ fallbackDaily: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { GET } from '../route';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { fallbackDaily } from '@/lib/market/finnhub';

const DAY_MS = 86_400_000;
const SECRET = 'test-secret';

// Ancla temporal: análisis hecho hace 60 días → ventana swing (30d) ya vencida.
const START_MS = Date.now() - 60 * DAY_MS;
const START_ISO = new Date(START_MS).toISOString();

/** Vela diaria sintética; t en segundos, `daysAfter` desde el análisis. */
function candle(daysAfter: number, h: number, l: number, c = (h + l) / 2) {
  return { t: Math.floor((START_MS + daysAfter * DAY_MS) / 1000), o: c, h, l, c, v: 0 };
}

function buyPlan(over: Record<string, unknown> = {}) {
  return {
    operativa: {
      signal: 'buy',
      entry_type: 'market',
      entrada: 100,
      stop_loss: 95,
      target: 110,
      atr_actual: 2,
      ratio_riesgo_beneficio: 2,
      horizonte: 'swing',
      ...over,
    },
  };
}

function req(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return makeRequest('http://localhost/api/cron/evaluate-trades', { method: 'GET', headers });
}

/** Monta el admin mock con builders para analyses_log y trade_outcomes. */
function mountAdmin(opts: {
  candidates: unknown[];
  existing?: { analysis_id: string }[];
}): { analyses: QueryBuilderMock; trades: QueryBuilderMock } {
  const analyses = makeBuilder({ then: { data: opts.candidates, error: null } });
  const trades = makeBuilder({ then: { data: opts.existing ?? [], error: null } });
  const mock = makeSupabaseMock({ builders: { analyses_log: analyses, trade_outcomes: trades } });
  vi.mocked(createSupabaseAdmin).mockReturnValue(mock.client as never);
  return { analyses, trades };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('evaluate-trades · auth', () => {
  it('500 si no hay CRON_SECRET', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('401 con Bearer incorrecto', async () => {
    const res = await GET(req({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });
});

describe('evaluate-trades · resolución', () => {
  it('persiste un win cuando el precio toca el target', async () => {
    const { trades } = mountAdmin({
      candidates: [{ id: 'an-1', ticker: 'AAPL', initial_price_at: START_ISO, a3_output: buyPlan() }],
    });
    vi.mocked(fallbackDaily).mockResolvedValue([
      candle(1, 101, 99),
      candle(2, 112, 108, 110), // toca target 110 → win
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resolved_count).toBe(1);
    expect(trades.insert).toHaveBeenCalledTimes(1);
    expect(trades.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis_id: 'an-1',
        direction: 'buy',
        entry_type: 'market',
        horizonte: 'swing',
        outcome: 'win',
        entry: 100,
        target: 110,
        exit_price: 110,
        rb_ratio: 2,
      })
    );
  });

  it('persiste un loss cuando el precio toca el stop primero', async () => {
    const { trades } = mountAdmin({
      candidates: [{ id: 'an-2', ticker: 'AAPL', initial_price_at: START_ISO, a3_output: buyPlan() }],
    });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 101, 99), candle(2, 99, 94, 95)]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(1);
    expect(trades.insert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'loss', exit_price: 95, r_multiple: -1 })
    );
  });
});

describe('evaluate-trades · descartes', () => {
  it('salta análisis hold (no es un trade) — sin insert', async () => {
    const { trades } = mountAdmin({
      candidates: [
        {
          id: 'hold-1',
          ticker: 'AAPL',
          initial_price_at: START_ISO,
          a3_output: { operativa: { signal: 'hold', entrada: null, stop_loss: null, target: null, horizonte: 'swing' } },
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
    expect(fallbackDaily).not.toHaveBeenCalled();
  });

  it('salta intradía (se evalúa con 4H en fase 4)', async () => {
    const { trades } = mountAdmin({
      candidates: [
        { id: 'intra-1', ticker: 'AAPL', initial_price_at: START_ISO, a3_output: buyPlan({ horizonte: 'intradia' }) },
      ],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
  });

  it('no re-evalúa un análisis ya presente en trade_outcomes', async () => {
    const { trades } = mountAdmin({
      candidates: [{ id: 'an-done', ticker: 'AAPL', initial_price_at: START_ISO, a3_output: buyPlan() }],
      existing: [{ analysis_id: 'an-done' }],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
  });

  it('cuenta como pending (sin persistir) si no hay barrera y la ventana no venció', async () => {
    const recentMs = Date.now() - 3 * DAY_MS; // ventana swing 30d NO vencida
    const recentISO = new Date(recentMs).toISOString();
    const { trades } = mountAdmin({
      candidates: [{ id: 'an-pend', ticker: 'AAPL', initial_price_at: recentISO, a3_output: buyPlan() }],
    });
    // velas dentro de ventana, sin tocar stop ni target
    vi.mocked(fallbackDaily).mockResolvedValue([
      { t: Math.floor((recentMs + DAY_MS) / 1000), o: 100, h: 101, l: 99, c: 100, v: 0 },
      { t: Math.floor((recentMs + 2 * DAY_MS) / 1000), o: 100, h: 102, l: 98, c: 100, v: 0 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.pending_count).toBe(1);
    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
  });
});
