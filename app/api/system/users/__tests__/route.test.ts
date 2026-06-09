/**
 * /api/system/users — autorización de la consola L0.
 *
 * Criterio de aceptación: un usuario logueado pero NO en system_access que
 * llame a la ruta (o a la RPC) recibe 403 y NUNCA se ejecuta get_users_overview.
 * Mismo patrón que lib/auth/__tests__/system-access.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';

function client(opts: { user: { id: string } | null; authorized: boolean; overview?: unknown[] }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'is_system_authorized') return { data: opts.authorized, error: null };
    if (name === 'get_users_overview') return { data: opts.overview ?? [], error: null };
    return { data: null, error: null };
  });
  return {
    client: { auth: { getUser: vi.fn(async () => ({ data: { user: opts.user }, error: null })) }, rpc },
    rpc,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/system/users · allowlist', () => {
  it('en la allowlist → 200 y ejecuta get_users_overview', async () => {
    const { client: c, rpc } = client({
      user: { id: 'u1' },
      authorized: true,
      overview: [{ user_id: 'u1', email: 'a@b.c' }],
    });
    vi.mocked(createSupabaseServer).mockResolvedValue(c as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('get_users_overview');
  });

  it('autenticado pero NO en allowlist → 403 y NO ejecuta get_users_overview', async () => {
    const { client: c, rpc } = client({ user: { id: 'u1' }, authorized: false });
    vi.mocked(createSupabaseServer).mockResolvedValue(c as never);

    const res = await GET();
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalledWith('get_users_overview');
  });

  it('no autenticado → 401', async () => {
    const { client: c } = client({ user: null, authorized: true });
    vi.mocked(createSupabaseServer).mockResolvedValue(c as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
