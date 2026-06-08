/**
 * Tests del gate de acceso a /system (autorización en servidor).
 *
 * Cubre los escenarios del DoD a nivel de unidad (el gate que comparten la
 * página y las APIs):
 *   - autorizado → ok
 *   - autenticado pero NO en allowlist → 403
 *   - no autenticado → 401
 *   + DEFAULT-DENY: cualquier fallo del RPC → no autorizado (nunca fail-open).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));

import { isSystemAuthorized, requireSystemApi } from '../system-access';
import { createSupabaseServer } from '@/lib/supabase/server';

// Client mínimo: isSystemAuthorized solo usa .rpc; requireSystemApi además
// .auth.getUser. Lo construimos a medida por test.
function client(opts: { user?: { id: string } | null; rpc: () => Promise<unknown> }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.user ?? null }, error: null })) },
    rpc: vi.fn(opts.rpc),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('isSystemAuthorized · default-deny', () => {
  it('rpc devuelve true → autorizado', async () => {
    const c = client({ rpc: async () => ({ data: true, error: null }) });
    expect(await isSystemAuthorized(c as never)).toBe(true);
  });

  it('rpc devuelve false → NO autorizado', async () => {
    const c = client({ rpc: async () => ({ data: false, error: null }) });
    expect(await isSystemAuthorized(c as never)).toBe(false);
  });

  it('rpc devuelve error → NO autorizado (default-deny)', async () => {
    const c = client({ rpc: async () => ({ data: null, error: { message: 'boom' } }) });
    expect(await isSystemAuthorized(c as never)).toBe(false);
  });

  it('rpc lanza (red/timeout) → NO autorizado (default-deny)', async () => {
    const c = client({ rpc: async () => { throw new Error('network'); } });
    expect(await isSystemAuthorized(c as never)).toBe(false);
  });

  it('rpc devuelve data no booleana → NO autorizado', async () => {
    const c = client({ rpc: async () => ({ data: 'yes', error: null }) });
    expect(await isSystemAuthorized(c as never)).toBe(false);
  });
});

describe('requireSystemApi · gate de las APIs', () => {
  it('autorizado → ok con supabase + userId', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      client({ user: { id: 'u1' }, rpc: async () => ({ data: true, error: null }) }) as never
    );
    const gate = await requireSystemApi();
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.userId).toBe('u1');
  });

  it('autenticado pero NO en allowlist → 403', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      client({ user: { id: 'u1' }, rpc: async () => ({ data: false, error: null }) }) as never
    );
    const gate = await requireSystemApi();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it('no autenticado → 401 (sin consultar la allowlist)', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    vi.mocked(createSupabaseServer).mockResolvedValue(
      { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) }, rpc } as never
    );
    const gate = await requireSystemApi();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('error del RPC con sesión válida → 403 (default-deny, no fail-open)', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      client({ user: { id: 'u1' }, rpc: async () => ({ data: null, error: { message: 'rls' } }) }) as never
    );
    const gate = await requireSystemApi();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });
});
