/**
 * Tests del prelude compartido requireApiUser (lib/auth/api-user.ts) — el gate
 * CSRF → rate-limit → auth que abre los 6 endpoints de agentes. Mockea sus tres
 * dependencias y verifica el corto-circuito en cada capa + el orden.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-helpers', () => ({ checkSameOrigin: vi.fn(), rateLimitByIP: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));

import { requireApiUser } from '../api-user';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import { createSupabaseServer } from '@/lib/supabase/server';

function req() {
  return new NextRequest('http://localhost/api/agents/run', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkSameOrigin).mockReturnValue(null);
  vi.mocked(rateLimitByIP).mockResolvedValue(null);
  vi.mocked(createSupabaseServer).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
  } as never);
});

describe('requireApiUser', () => {
  it('CSRF rechaza → devuelve ese NextResponse y NO llega a rate-limit', async () => {
    const resp = NextResponse.json({ error: 'csrf_blocked' }, { status: 403 });
    vi.mocked(checkSameOrigin).mockReturnValue(resp);
    const gate = await requireApiUser(req());
    expect(gate).toBe(resp);
    expect(rateLimitByIP).not.toHaveBeenCalled();
  });

  it('rate-limit rechaza → devuelve ese NextResponse y NO llega a auth', async () => {
    const resp = NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
    vi.mocked(rateLimitByIP).mockResolvedValue(resp);
    const gate = await requireApiUser(req());
    expect(gate).toBe(resp);
    expect(createSupabaseServer).not.toHaveBeenCalled();
  });

  it('sin sesión → 401', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    } as never);
    const gate = await requireApiUser(req());
    expect(gate).toBeInstanceOf(NextResponse);
    expect((gate as NextResponse).status).toBe(401);
  });

  it('pasa los tres gates → { user, supabase }', async () => {
    const gate = await requireApiUser(req());
    expect(gate).not.toBeInstanceOf(NextResponse);
    expect((gate as { user: { id: string } }).user.id).toBe('u1');
  });

  it('bucket de rate-limit por defecto = analysis', async () => {
    await requireApiUser(req());
    expect(rateLimitByIP).toHaveBeenCalledWith(expect.anything(), 'analysis');
  });
});
