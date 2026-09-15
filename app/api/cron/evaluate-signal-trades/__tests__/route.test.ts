/**
 * Tests del cron /api/cron/evaluate-signal-trades (backtest path-dependent CMT).
 *
 * Mockea Supabase admin (harness de rutas) y fallbackDaily; deja correr
 * buildSignalTradePlan + evaluateTrade de verdad (son puros) — así el test cubre
 * el pegamento cron↔motor con velas sintéticas controladas.
 *
 * Invariantes que fija (R1/R2 del plan de precisión 2026-09):
 *   - entry_type NULL → NO se evalúa: se persiste `not_evaluable` (terminal),
 *     entry_type null, sin fetch de velas. Nunca 'market' por defecto.
 *   - una señal 'limit' NUNCA se evalúa como 'market': sin toque del nivel →
 *     no_fill (no win), y la fila persistida lleva entry_type='limit'.
 *   - la selección de candidatas no acota `emitted_at` → borrar una fila de
 *     outcome basta para que el cron re-evalúe la señal (purga phantom).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeRequest, makeBuilder, type QueryBuilderMock } from '@/test/helpers/route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/market/finnhub', () => ({ fallbackDaily: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { GET } from '../route';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { fallbackDaily } from '@/lib/market/finnhub';

const DAY_MS = 86_400_000;
const SECRET = 'test-secret';

// Ancla temporal: señal emitida hace 60 días → ventana 1D (30d) ya vencida.
const START_MS = Date.now() - 60 * DAY_MS;
const START_ISO = new Date(START_MS).toISOString();

/** Vela diaria sintética; t en segundos, `daysAfter` desde la emisión. */
function candle(daysAfter: number, h: number, l: number, c = (h + l) / 2) {
  return { t: Math.floor((START_MS + daysAfter * DAY_MS) / 1000), o: c, h, l, c, v: 0 };
}

interface SignalRow {
  id: string;
  ticker: string;
  emitted_at: string;
  entry_type: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
}

/** Señal short: entrada 100 (resistencia), stop 105, target 90. */
function shortSignal(over: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'sig-1',
    ticker: 'BTC',
    emitted_at: START_ISO,
    entry_type: 'limit',
    entry_price: 100,
    stop_loss: 105,
    target_price: 90,
    ...over,
  };
}

function req(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return makeRequest('http://localhost/api/cron/evaluate-signal-trades', { method: 'GET', headers });
}

/**
 * Monta el admin mock. `from('signals_history')` → candidatas;
 * `from('signal_trade_outcomes')` reusa un único builder (el done-set y el
 * insert comparten tabla).
 */
function mountAdmin(opts: {
  candidates?: SignalRow[];
  existing?: { signal_id: string }[];
}): { signals: QueryBuilderMock; outcomes: QueryBuilderMock } {
  const signals = makeBuilder({ then: { data: opts.candidates ?? [], error: null } });
  const outcomes = makeBuilder({ then: { data: opts.existing ?? [], error: null } });
  const from = vi.fn((table: string) => {
    if (table === 'signals_history') return signals;
    if (table === 'signal_trade_outcomes') return outcomes;
    return makeBuilder();
  });
  const client = { auth: { getUser: vi.fn() }, from };
  vi.mocked(createSupabaseAdmin).mockReturnValue(client as never);
  return { signals, outcomes };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('evaluate-signal-trades · auth', () => {
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

describe('evaluate-signal-trades · entry_type NULL (R1)', () => {
  it('persiste not_evaluable con entry_type null y NO fetcha velas — nunca market por defecto', async () => {
    const { outcomes } = mountAdmin({ candidates: [shortSignal({ entry_type: null })] });
    // Si el cron degradase a 'market', estas velas darían un 'win' fantasma
    // (nunca tocan 100, sí tocan 90).
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 98, 92), candle(2, 95, 89, 90)]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resolved_count).toBe(1);
    expect(body.resolved[0]).toEqual({
      signal_id: 'sig-1',
      outcome: 'not_evaluable',
      reason: 'entry_type_unknown',
    });
    expect(fallbackDaily).not.toHaveBeenCalled();
    expect(outcomes.insert).toHaveBeenCalledTimes(1);
    expect(outcomes.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        signal_id: 'sig-1',
        direction: 'sell', // geometría válida → dirección auditable
        entry_type: null,
        outcome: 'not_evaluable',
        exit_price: null,
        r_multiple: null,
      })
    );
    const inserted = outcomes.insert.mock.calls[0]![0] as { outcome: string; entry_type: unknown };
    expect(inserted.outcome).not.toBe('win');
    expect(inserted.entry_type).not.toBe('market');
  });

  it('geometría degenerada → not_evaluable con direction null (reason distinto)', async () => {
    const { outcomes } = mountAdmin({
      candidates: [shortSignal({ entry_type: 'market', stop_loss: 105, target_price: 110 })],
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved[0]).toEqual({
      signal_id: 'sig-1',
      outcome: 'not_evaluable',
      reason: 'degenerate_geometry',
    });
    expect(outcomes.insert).toHaveBeenCalledWith(
      expect.objectContaining({ direction: null, entry_type: null, outcome: 'not_evaluable' })
    );
    expect(fallbackDaily).not.toHaveBeenCalled();
  });
});

describe('evaluate-signal-trades · regresión: limit nunca se evalúa como market', () => {
  it('short LÍMITE cuyo nivel nunca se toca → no_fill (no win), fila con entry_type=limit', async () => {
    const { outcomes } = mountAdmin({ candidates: [shortSignal({ entry_type: 'limit' })] });
    // Precio siempre por debajo de 100 → la venta límite jamás dispara; toca 90.
    // Evaluado como market esto sería un 'win' con r_multiple +2 (el bug pre-0019).
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 98, 92), candle(2, 95, 89, 90)]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(1);
    expect(body.resolved[0]).toEqual({ signal_id: 'sig-1', outcome: 'no_fill' });
    expect(outcomes.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        signal_id: 'sig-1',
        direction: 'sell',
        entry_type: 'limit',
        outcome: 'no_fill',
        exit_price: null,
        r_multiple: null,
      })
    );
    const inserted = outcomes.insert.mock.calls[0]![0] as { entry_type: unknown };
    expect(inserted.entry_type).not.toBe('market');
  });

  it('short LÍMITE que sí rebota al nivel y cae al target → win legítimo (entry_type=limit)', async () => {
    const { outcomes } = mountAdmin({ candidates: [shortSignal({ entry_type: 'limit' })] });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 101, 99, 100), candle(2, 92, 88, 90)]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved[0]).toEqual({ signal_id: 'sig-1', outcome: 'win' });
    expect(outcomes.insert).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: 'limit', outcome: 'win', exit_price: 90, r_multiple: 2 })
    );
  });

  it('señal MARKET explícita se evalúa a mercado desde la emisión', async () => {
    const { outcomes } = mountAdmin({ candidates: [shortSignal({ entry_type: 'market' })] });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 98, 92), candle(2, 95, 89, 90)]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved[0]).toEqual({ signal_id: 'sig-1', outcome: 'win' });
    expect(outcomes.insert).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: 'market', outcome: 'win', exit_price: 90 })
    );
  });
});

describe('evaluate-signal-trades · selección de candidatas (R2)', () => {
  it('no acota emitted_at ni excluye por fecha: una señal sin fila de outcome vuelve a entrar', async () => {
    const { signals } = mountAdmin({ candidates: [shortSignal({ entry_type: 'limit' })] });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 98, 92)]);

    await GET(req());

    // Filtros esperados: timeframe 1D + niveles NOT NULL. Ninguna cota temporal —
    // es lo que permite que la purga de fills phantom se re-evalúe sola.
    expect(signals.eq).toHaveBeenCalledWith('timeframe', '1D');
    expect(signals.not).toHaveBeenCalledWith('entry_price', 'is', null);
    expect(signals.not).toHaveBeenCalledWith('stop_loss', 'is', null);
    expect(signals.not).toHaveBeenCalledWith('target_price', 'is', null);
    expect(signals.order).toHaveBeenCalledWith('emitted_at', { ascending: true });
    expect(signals.gte).not.toHaveBeenCalled();
    expect(signals.gt).not.toHaveBeenCalled();
    expect(signals.lte).not.toHaveBeenCalled();
    expect(signals.lt).not.toHaveBeenCalled();
  });

  it('salta una señal que ya tiene fila en signal_trade_outcomes (existencia = resuelto)', async () => {
    const { outcomes } = mountAdmin({
      candidates: [shortSignal({ entry_type: 'limit' })],
      existing: [{ signal_id: 'sig-1' }],
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(0);
    expect(outcomes.insert).not.toHaveBeenCalled();
    expect(fallbackDaily).not.toHaveBeenCalled();
  });

  it('cuenta como pending (sin persistir) si el límite aún no disparó y la ventana no venció', async () => {
    const recentMs = Date.now() - 3 * DAY_MS;
    const { outcomes } = mountAdmin({
      candidates: [shortSignal({ entry_type: 'limit', emitted_at: new Date(recentMs).toISOString() })],
    });
    vi.mocked(fallbackDaily).mockResolvedValue([
      { t: Math.floor((recentMs + DAY_MS) / 1000), o: 97, h: 98, l: 96, c: 97, v: 0 },
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.pending_count).toBe(1);
    expect(body.resolved_count).toBe(0);
    expect(outcomes.insert).not.toHaveBeenCalled();
  });
});
