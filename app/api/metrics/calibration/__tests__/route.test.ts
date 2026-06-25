/**
 * Tests de /api/metrics/calibration — enforcement de la allowlist en la API
 * interna (la superficie de ataque que más se olvida: llamar directo sin pasar
 * por la página /system).
 *
 * Esta API usa service-role (createSupabaseAdmin, bypassa RLS) para leer
 * métricas cross-user → el gate es OBLIGATORIO. Verificamos que:
 *   - autorizado → 200 y se accede a los datos (admin llamado).
 *   - autenticado pero NO en allowlist → 403 y NUNCA se tocan los datos.
 *   - no autenticado → 401 y NUNCA se tocan los datos.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { makeBuilder } from '@/test/helpers/route';

function serverClient(opts: { user: { id: string } | null; authorized: boolean }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.user }, error: null })) },
    rpc: vi.fn(async () => ({ data: opts.authorized, error: null })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // admin: signal_outcomes.select(...).limit(...) → sin filas (suficiente).
  const builder = makeBuilder({ then: { data: [], error: null } });
  vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => builder) } as never);
});

describe('GET /api/metrics/calibration · allowlist', () => {
  it('usuario en la allowlist → 200 y accede a los datos', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: { id: 'u1' }, authorized: true }) as never
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('total');
    // Ejes nuevos (Fase 1) presentes en la respuesta.
    expect(body).toHaveProperty('by_actionable');
    expect(body).toHaveProperty('by_kappa');
    expect(createSupabaseAdmin).toHaveBeenCalledTimes(1);
  });

  it('autenticado pero NO en allowlist → 403 y NO toca los datos (llamada directa bloqueada)', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: { id: 'u1' }, authorized: false }) as never
    );
    const res = await GET();
    expect(res.status).toBe(403);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('no autenticado → 401 y NO toca los datos', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: null, authorized: true }) as never
    );
    const res = await GET();
    expect(res.status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
});
