/**
 * Tests del route handler POST /api/watchlist — añade un ticker a la
 * watchlist default. Cubre auth, validación de body, cálculo de position
 * desde el count, inserción y mapeo de errores (duplicado vs genérico).
 *
 * sanitizeDbError se mantiene REAL (solo se mockean los gates) para validar
 * el mapeo de error.code a respuesta.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  makeRequest,
  makeSupabaseMock,
  makeBuilder,
  type SupabaseMock,
  type QueryBuilderMock,
} from '@/test/helpers/route';

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>();
  return { ...actual, checkSameOrigin: vi.fn(), rateLimitByIP: vi.fn() };
});

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/watchlist', () => ({ getOrCreateDefaultWatchlist: vi.fn() }));

import { POST } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getOrCreateDefaultWatchlist } from '@/lib/watchlist';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import { NextResponse } from 'next/server';

const URL = 'http://localhost:3000/api/watchlist';

const WATCHLIST = {
  id: 'wl-1',
  user_id: 'user-1',
  name: 'Mi Watchlist',
  is_default: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ITEM = {
  id: 'item-1',
  watchlist_id: 'wl-1',
  ticker: 'AAPL',
  asset_type: 'equity',
  position: 3,
  notes: null,
  added_at: '2026-01-01T00:00:00Z',
  is_pinned: false,
  pinned_at: null,
};

let supa: SupabaseMock;
let itemsBuilder: QueryBuilderMock;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkSameOrigin).mockReturnValue(null);
  vi.mocked(rateLimitByIP).mockResolvedValue(null);
  vi.mocked(getOrCreateDefaultWatchlist).mockResolvedValue(WATCHLIST as never);

  itemsBuilder = makeBuilder({
    then: { count: 3, data: null, error: null }, // count query
    single: { data: ITEM, error: null }, // insert().select().single()
  });
  supa = makeSupabaseMock({
    user: { id: 'user-1' },
    builders: { watchlist_items: itemsBuilder },
  });
  vi.mocked(createSupabaseServer).mockResolvedValue(supa.client as never);
});

describe('POST /api/watchlist', () => {
  it('200: inserta con position desde el count y ticker en mayúsculas', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: 'aapl' } }));
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ id: 'item-1', ticker: 'AAPL' });
    expect(itemsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        watchlist_id: 'wl-1',
        ticker: 'AAPL',
        asset_type: 'equity', // default del schema
        position: 3,
      })
    );
  });

  it('403 si CSRF bloquea (sin tocar auth)', async () => {
    vi.mocked(checkSameOrigin).mockReturnValue(
      NextResponse.json({ error: 'csrf_blocked' }, { status: 403 })
    );
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(403);
    expect(supa.auth.getUser).not.toHaveBeenCalled();
  });

  it('401 si no hay usuario', async () => {
    supa.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(401);
    expect(vi.mocked(getOrCreateDefaultWatchlist)).not.toHaveBeenCalled();
  });

  it('400 si el ticker es inválido', async () => {
    const res = await POST(makeRequest(URL, { body: { ticker: '' } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid');
  });

  it('409 duplicate si el insert choca con unique (23505)', async () => {
    itemsBuilder.single.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('duplicate');
  });

  it('500 ante un error de DB genérico', async () => {
    itemsBuilder.single.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation missing' },
    });
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(500);
  });

  it('position 0 cuando la watchlist está vacía (count null)', async () => {
    itemsBuilder.then = (resolve) =>
      Promise.resolve({ count: null, data: null, error: null }).then(resolve);
    const res = await POST(makeRequest(URL, { body: { ticker: 'AAPL' } }));
    expect(res.status).toBe(200);
    expect(itemsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ position: 0 })
    );
  });
});
