/**
 * Tests de /api/cmt/scan — plan de precisión 2026-09, bloque 2:
 *
 *   R3  · dedup en persistSignals: misma señal (dirección + entry ±1% +
 *         target ±1%) abierta (<30d, sin fila en signal_trade_outcomes) → se
 *         descarta; con outcome o con niveles distintos → se inserta.
 *   R13 · fin de semana (path cron): sáb/dom UTC salta los tickers no-crypto,
 *         deja pasar crypto; parametrizable con CMT_SCAN_SKIP_WEEKEND.
 *
 * Mockea Supabase (harness de rutas), el mercado y buildCMTSignal (la señal es
 * un fixture fijo — lo que se prueba es el pegamento persist/skip, no el
 * compute). `from('signals_history')` sirve builders desde una cola: 1ª llamada
 * = SELECT de recientes, 2ª = INSERT.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeRequest, makeBuilder, type QueryBuilderMock } from '@/test/helpers/route';
import type { CMTOutput } from '@/agents/cmt/schema';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/market/finnhub', () => ({ fallbackDaily: vi.fn(), fallbackIntraday: vi.fn() }));
vi.mock('@/agents/cmt/build-signal', () => ({ buildCMTSignal: vi.fn() }));
vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>();
  return { ...actual, checkSameOrigin: vi.fn(() => null), rateLimitByIP: vi.fn(async () => null) };
});

import { GET, POST } from '../route';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import { fallbackDaily, fallbackIntraday } from '@/lib/market/finnhub';
import { buildCMTSignal } from '@/agents/cmt/build-signal';

const SECRET = 'test-secret';
// 2026-09-12 es sábado, 2026-09-14 lunes (se asevera en el primer test).
const SATURDAY_UTC = '2026-09-12T21:00:00.000Z';
const MONDAY_UTC = '2026-09-14T21:00:00.000Z';

function cronReq() {
  return makeRequest('http://localhost/api/cmt/scan', {
    method: 'GET',
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

/** Señal CMT fija: compra a mercado 100 / stop 95 / target 110. */
function signal(over: Partial<CMTOutput> = {}): CMTOutput {
  return {
    ticker: 'SPY',
    level: 'urgente',
    timeframe: '1D',
    setup_detected: 'Compra a mercado 100 · stop 95 · target 110 (R/B 2.00)',
    confidence_pct: 60,
    entry_type: 'market',
    entry_price: 100,
    stop_loss: 95,
    target_price: 110,
    risk_reward_ratio: 2,
    indicators: { tendencia: 'alcista (fuerza 3/5)' },
    invalidation_factor: 'Cierre diario bajo 95.',
    ...over,
  };
}

interface RecentRow {
  id: string;
  ticker: string;
  entry_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
}

/**
 * Monta el admin mock del path cron: una watchlist default con `tickers`,
 * `recent` = filas de signals_history de los últimos 30d, `evaluated` = ids con
 * fila en signal_trade_outcomes.
 */
function mountCronAdmin(opts: {
  tickers: string[];
  recent?: RecentRow[];
  evaluated?: string[];
  recentError?: string;
}): { select: QueryBuilderMock; insert: QueryBuilderMock; outcomes: QueryBuilderMock } {
  const watchlists = makeBuilder({ then: { data: [{ id: 'wl-1', user_id: 'user-1' }], error: null } });
  const items = makeBuilder({ then: { data: opts.tickers.map((ticker) => ({ ticker })), error: null } });
  const select = makeBuilder({
    then: opts.recentError
      ? { data: null, error: { message: opts.recentError } }
      : { data: opts.recent ?? [], error: null },
  });
  const insert = makeBuilder({ then: { data: null, error: null } });
  const outcomes = makeBuilder({
    then: { data: (opts.evaluated ?? []).map((signal_id) => ({ signal_id })), error: null },
  });

  const signalsQueue = [select, insert];
  const from = vi.fn((table: string) => {
    if (table === 'watchlists') return watchlists;
    if (table === 'watchlist_items') return items;
    if (table === 'signals_history') return signalsQueue.shift() ?? makeBuilder();
    if (table === 'signal_trade_outcomes') return outcomes;
    return makeBuilder();
  });
  vi.mocked(createSupabaseAdmin).mockReturnValue({ auth: { getUser: vi.fn() }, from } as never);
  return { select, insert, outcomes };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  delete process.env.CMT_SCAN_SKIP_WEEKEND;
  // Solo Date: el sleep entre tickers usa setTimeout real (con 1 ticker no duerme).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(MONDAY_UTC));
  vi.mocked(fallbackDaily).mockResolvedValue([{ t: 1, o: 100, h: 101, l: 99, c: 100, v: 1000 }]);
  vi.mocked(fallbackIntraday).mockResolvedValue([]);
  vi.mocked(buildCMTSignal).mockImplementation((input) => signal({ ticker: input.ticker }));
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
  delete process.env.CMT_SCAN_SKIP_WEEKEND;
});

describe('cmt/scan · fixtures de calendario', () => {
  it('las fechas ancla son sábado y lunes en UTC', () => {
    expect(new Date(SATURDAY_UTC).getUTCDay()).toBe(6);
    expect(new Date(MONDAY_UTC).getUTCDay()).toBe(1);
  });
});

describe('cmt/scan · dedup (R3)', () => {
  it('misma señal abierta (<30d, dirección + entry ±1% + target ±1%, sin outcome) → descartada', async () => {
    const { insert, outcomes } = mountCronAdmin({
      tickers: ['SPY'],
      recent: [{ id: 'sig-1', ticker: 'SPY', entry_price: 100.5, stop_loss: 95.2, target_price: 109.5 }],
    });

    const res = await GET(cronReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total_scanned).toBe(1);
    expect(body.total_persisted).toBe(0);
    expect(body.total_deduped).toBe(1);
    expect(insert.insert).not.toHaveBeenCalled();
    // La lectura de outcomes va acotada a los ids del propio user (patrón radar).
    expect(outcomes.in).toHaveBeenCalledWith('signal_id', ['sig-1']);
  });

  it('misma señal pero YA evaluada (fila en signal_trade_outcomes) → se inserta (setup nuevo)', async () => {
    const { insert } = mountCronAdmin({
      tickers: ['SPY'],
      recent: [{ id: 'sig-1', ticker: 'SPY', entry_price: 100, stop_loss: 95, target_price: 110 }],
      evaluated: ['sig-1'],
    });

    const body = await (await GET(cronReq())).json();

    expect(body.total_persisted).toBe(1);
    expect(body.total_deduped).toBe(0);
    expect(insert.insert).toHaveBeenCalledTimes(1);
    expect(insert.insert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: 'user-1', ticker: 'SPY', entry_price: 100, target_price: 110, entry_type: 'market' }),
    ]);
  });

  it('entry fuera del ±1% → se inserta', async () => {
    const { insert } = mountCronAdmin({
      tickers: ['SPY'],
      recent: [{ id: 'sig-1', ticker: 'SPY', entry_price: 103, stop_loss: 98, target_price: 110 }],
    });

    const body = await (await GET(cronReq())).json();

    expect(body.total_persisted).toBe(1);
    expect(body.total_deduped).toBe(0);
    expect(insert.insert).toHaveBeenCalledTimes(1);
  });

  it('target fuera del ±1% → se inserta', async () => {
    const { insert } = mountCronAdmin({
      tickers: ['SPY'],
      recent: [{ id: 'sig-1', ticker: 'SPY', entry_price: 100, stop_loss: 95, target_price: 115 }],
    });

    const body = await (await GET(cronReq())).json();

    expect(body.total_deduped).toBe(0);
    expect(insert.insert).toHaveBeenCalledTimes(1);
  });

  it('misma geometría de precios pero dirección opuesta → se inserta', async () => {
    // Existente: venta (target abajo, stop arriba) con entry 100; candidata: compra.
    const { insert } = mountCronAdmin({
      tickers: ['SPY'],
      recent: [{ id: 'sig-1', ticker: 'SPY', entry_price: 100, stop_loss: 105, target_price: 90 }],
    });

    const body = await (await GET(cronReq())).json();

    expect(body.total_deduped).toBe(0);
    expect(insert.insert).toHaveBeenCalledTimes(1);
  });

  it('el SELECT de recientes se acota por user_id + ticker + ventana 30d', async () => {
    const { select } = mountCronAdmin({ tickers: ['SPY'] });

    await GET(cronReq());

    expect(select.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(select.in).toHaveBeenCalledWith('ticker', ['SPY']);
    const [col, since] = select.gte.mock.calls[0] as [string, string];
    expect(col).toBe('emitted_at');
    const sinceMs = Date.parse(since);
    expect(Date.parse(MONDAY_UTC) - sinceMs).toBe(30 * 86_400_000);
  });

  it('si falla la lectura de recientes, inserta sin dedup (best-effort)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { insert } = mountCronAdmin({ tickers: ['SPY'], recentError: 'boom' });

    const body = await (await GET(cronReq())).json();

    expect(body.total_persisted).toBe(1);
    expect(body.total_deduped).toBe(0);
    expect(insert.insert).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sin_senal no se persiste ni cuenta como dedup', async () => {
    vi.mocked(buildCMTSignal).mockImplementation((input) =>
      signal({ ticker: input.ticker, level: 'sin_senal', entry_type: null, entry_price: null, stop_loss: null, target_price: null, risk_reward_ratio: null })
    );
    const { select, insert } = mountCronAdmin({ tickers: ['SPY'] });

    const body = await (await GET(cronReq())).json();

    expect(body.total_persisted).toBe(0);
    expect(body.total_deduped).toBe(0);
    expect(select.select).not.toHaveBeenCalled();
    expect(insert.insert).not.toHaveBeenCalled();
  });
});

describe('cmt/scan · fin de semana (R13)', () => {
  it('sábado UTC + SPY (no crypto) → se salta, sin llamada a mercado', async () => {
    vi.setSystemTime(new Date(SATURDAY_UTC));
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    mountCronAdmin({ tickers: ['SPY'] });

    const body = await (await GET(cronReq())).json();

    expect(body.skipped_weekend).toBe(1);
    expect(body.total_scanned).toBe(0);
    expect(body.total_persisted).toBe(0);
    expect(fallbackDaily).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining('weekend skip'));
    info.mockRestore();
  });

  it('sábado UTC + BTC-USD (crypto, 24/7) → se escanea', async () => {
    vi.setSystemTime(new Date(SATURDAY_UTC));
    mountCronAdmin({ tickers: ['BTC-USD'] });

    const body = await (await GET(cronReq())).json();

    expect(body.skipped_weekend).toBe(0);
    expect(body.total_scanned).toBe(1);
    expect(fallbackDaily).toHaveBeenCalledWith('BTC-USD', '1y');
  });

  it('lunes UTC + SPY → se escanea', async () => {
    vi.setSystemTime(new Date(MONDAY_UTC));
    mountCronAdmin({ tickers: ['SPY'] });

    const body = await (await GET(cronReq())).json();

    expect(body.skipped_weekend).toBe(0);
    expect(body.total_scanned).toBe(1);
    expect(fallbackDaily).toHaveBeenCalledWith('SPY', '1y');
  });

  it('CMT_SCAN_SKIP_WEEKEND=false desactiva el salto', async () => {
    process.env.CMT_SCAN_SKIP_WEEKEND = 'false';
    vi.setSystemTime(new Date(SATURDAY_UTC));
    mountCronAdmin({ tickers: ['SPY'] });

    const body = await (await GET(cronReq())).json();

    expect(body.skipped_weekend).toBe(0);
    expect(body.total_scanned).toBe(1);
  });
});

describe('cmt/scan · path manual', () => {
  it('devuelve `deduped` junto a scanned/persisted', async () => {
    // Cliente cookie-auth del user: watchlist default + items.
    const wl = makeBuilder({ maybeSingle: { data: { id: 'wl-1' }, error: null } });
    // El path manual encadena `.returns<T>()` (postgrest-js) que el harness base
    // no mockea: lo añadimos devolviendo el propio builder (sigue siendo thenable).
    const items = makeBuilder({ then: { data: [{ ticker: 'SPY' }], error: null } }) as QueryBuilderMock & {
      returns: ReturnType<typeof vi.fn>;
    };
    items.returns = vi.fn(() => items);
    const serverFrom = vi.fn((table: string) => (table === 'watchlists' ? wl : items));
    vi.mocked(createSupabaseServer).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
      from: serverFrom,
    } as never);
    // Admin (persist): una señal abierta idéntica → dedup.
    const { insert } = mountCronAdmin({
      tickers: ['SPY'],
      recent: [{ id: 'sig-1', ticker: 'SPY', entry_price: 100, stop_loss: 95, target_price: 110 }],
    });

    const res = await POST(makeRequest('http://localhost/api/cmt/scan', { method: 'POST' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scanned).toBe(1);
    expect(body.persisted).toBe(0);
    expect(body.deduped).toBe(1);
    expect(insert.insert).not.toHaveBeenCalled();
  });
});
