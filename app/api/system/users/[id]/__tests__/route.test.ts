/**
 * /api/system/users/[id] — validación de UUID + autorización (consola L1).
 *
 * Criterios: [id] se valida como UUID ANTES de tocar DB; sin allowlist → 403.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';

const UUID = '11111111-1111-1111-1111-111111111111';

function client(opts: { user: { id: string } | null; authorized: boolean }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'is_system_authorized') return { data: opts.authorized, error: null };
    if (name === 'get_user_activity') return { data: { totals: {}, by_ticker: [], recent: [] }, error: null };
    return { data: null, error: null };
  });
  return {
    client: { auth: { getUser: vi.fn(async () => ({ data: { user: opts.user }, error: null })) }, rpc },
    rpc,
  };
}

const req = () => new NextRequest('http://localhost/api/system/users/x');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/system/users/[id]', () => {
  it('UUID inválido → 400 y NO ejecuta get_user_activity (no toca DB)', async () => {
    const { client: c, rpc } = client({ user: { id: 'u1' }, authorized: true });
    vi.mocked(createSupabaseServer).mockResolvedValue(c as never);

    const res = await GET(req(), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalledWith('get_user_activity', expect.anything());
  });

  it('UUID válido + allowlist → 200 con la actividad', async () => {
    const { client: c, rpc } = client({ user: { id: 'u1' }, authorized: true });
    vi.mocked(createSupabaseServer).mockResolvedValue(c as never);

    const res = await GET(req(), { params: { id: UUID } });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('get_user_activity', { target_user: UUID });
  });

  it('autenticado pero NO en allowlist → 403 (aunque el UUID sea válido)', async () => {
    const { client: c, rpc } = client({ user: { id: 'u1' }, authorized: false });
    vi.mocked(createSupabaseServer).mockResolvedValue(c as never);

    const res = await GET(req(), { params: { id: UUID } });
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalledWith('get_user_activity', expect.anything());
  });
});
