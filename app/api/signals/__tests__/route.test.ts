/**
 * Tests de GET /api/signals — track record por fila Y por cluster (R9).
 *
 * Guarda dos cosas:
 *   - `track` viaja en la respuesta con la misma cifra que calcula la UI
 *     (mismo helper `computeTrackRecord`): por fila inflada por reemisión
 *     diaria, por cluster colapsada (ticker + dirección + entrada ±1% + ≤3d).
 *   - El patrón anti-fuga: los outcomes (service-role) se leen acotados con
 *     `.in('signal_id', ids)` donde los ids salen SOLO de la query con RLS.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>();
  return { ...actual, rateLimitByIP: vi.fn() };
});
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIP } from '@/lib/api-helpers';
import { makeBuilder, makeRequest, type QueryBuilderMock } from '@/test/helpers/route';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 5, 1, 21);

/** Builder con `.returns()` (el harness base no lo incluye; la ruta lo encadena). */
function builderWithReturns(rows: unknown[]): QueryBuilderMock & { returns: ReturnType<typeof vi.fn> } {
  const b = makeBuilder({ then: { data: rows, error: null } }) as QueryBuilderMock & {
    returns: ReturnType<typeof vi.fn>;
  };
  b.returns = vi.fn(() => b);
  return b;
}

function sig(day: number, over: Record<string, unknown> = {}) {
  return {
    id: `sig-${day}`,
    user_id: 'user-1',
    ticker: 'SPY',
    timeframe: '1D',
    level: 'atencion',
    confidence_pct: 60,
    setup_detected: 'Compra en soporte',
    invalidation_factor: 'cierre bajo soporte',
    indicators: [],
    entry_price: 100,
    stop_loss: 95,
    target_price: 110,
    risk_reward_ratio: 2,
    entry_type: 'limit',
    acknowledged_at: null,
    emitted_at: new Date(T0 + day * DAY).toISOString(),
    ...over,
  };
}

function outcome(signal_id: string, o: string, r: number | null) {
  return {
    signal_id,
    outcome: o,
    r_multiple: r,
    direction: 'buy',
    entry: 100,
    entry_type: 'limit',
    evaluated_at: new Date(T0).toISOString(),
    exit_price: null,
    resolved_days: null,
    return_pct: null,
    stop_loss: 95,
    target: 110,
    timeframe: '1D',
  };
}

function serverClient(user: { id: string } | null, signalsBuilder: QueryBuilderMock) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(() => signalsBuilder),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimitByIP).mockResolvedValue(null);
});

describe('GET /api/signals', () => {
  it('no autenticado → 401 y NO toca el admin (service-role)', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient(null, builderWithReturns([])) as never
    );
    const res = await GET(makeRequest('http://localhost/api/signals', { method: 'GET' }));
    expect(res.status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('3 reemisiones ganadoras del mismo nivel → por fila 3W Σ+6R, por cluster n=1 1W Σ+2R', async () => {
    const signals = [sig(3), sig(2), sig(1)]; // orden emitted_at desc, como la query
    const outcomes = signals.map((s) => outcome(s.id, 'win', 2));
    const sb = builderWithReturns(signals);
    const ab = builderWithReturns(outcomes);
    vi.mocked(createSupabaseServer).mockResolvedValue(serverClient({ id: 'user-1' }, sb) as never);
    vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => ab) } as never);

    const res = await GET(makeRequest('http://localhost/api/signals', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.signals).toHaveLength(3);
    expect(body.signals.every((s: { outcome: unknown }) => s.outcome != null)).toBe(true);
    expect(body.track).toMatchObject({ win: 3, loss: 0, denom: 3, hitRate: 100, sumR: 6 });
    expect(body.track.clusters).toMatchObject({ n: 1, win: 1, loss: 0, hitRate: 100, sumR: 2, gapDays: 3 });

    // Anti-fuga: el IN se acota a los ids que salieron de la query con RLS.
    expect(ab.in).toHaveBeenCalledWith('signal_id', ['sig-3', 'sig-2', 'sig-1']);
  });

  it('sin outcomes (fallo best-effort) → señales sin outcome y track vacío, sin romper', async () => {
    const sb = builderWithReturns([sig(1)]);
    const ab = makeBuilder({ then: { data: null, error: { message: 'boom' } } }) as QueryBuilderMock & {
      returns: ReturnType<typeof vi.fn>;
    };
    ab.returns = vi.fn(() => ab);
    vi.mocked(createSupabaseServer).mockResolvedValue(serverClient({ id: 'user-1' }, sb) as never);
    vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => ab) } as never);

    const res = await GET(makeRequest('http://localhost/api/signals', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signals[0].outcome).toBeNull();
    expect(body.track).toMatchObject({ denom: 0, hitRate: null, sumR: null });
    expect(body.track.clusters).toMatchObject({ n: 0, hitRate: null, sumR: null });
    expect(body.stats).toEqual({ urgente: 0, atencion: 1, monitorear: 0 });
  });

  it('sin señales → no consulta outcomes (admin no llamado) y track vacío', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ id: 'user-1' }, builderWithReturns([])) as never
    );
    const res = await GET(makeRequest('http://localhost/api/signals', { method: 'GET' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
    expect(body.track.clusters.n).toBe(0);
  });
});
