/**
 * Tests del route handler GET /api/watchlist/radar — foco en la capa F2:
 * enriquecer cada fila con el `outcome` de backtest de su señal SIN fuga de
 * datos entre usuarios.
 *
 * Invariante anti-fuga (mismo patrón que /api/signals): los outcomes viven en
 * `signal_trade_outcomes` (service-role only), se leen con el admin client PERO
 * acotados con `.in('signal_id', ids)` donde `ids` son SOLO los signal.id que
 * ya salieron filtrados por RLS del usuario vía la RPC `get_watchlist_radar`.
 *
 * Estrategia: mockeamos los gates + supabase (server con .rpc, admin con
 * from().select().in()) + fallbackQuote. No hay red ni DB reales.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeBuilder, type QueryBuilderMock } from '@/test/helpers/route';

/**
 * El route usa `.returns<T>()` (postgrest-js) tras `.in()`, que el harness base
 * no mockea. Lo añadimos devolviendo el propio builder (sigue siendo thenable),
 * igual que el resto de métodos encadenables.
 */
type BuilderWithReturns = QueryBuilderMock & { returns: ReturnType<typeof vi.fn> };
function withReturns(b: QueryBuilderMock): BuilderWithReturns {
  const bb = b as BuilderWithReturns;
  bb.returns = vi.fn(() => bb);
  return bb;
}

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>();
  return { ...actual, rateLimitByIP: vi.fn() };
});

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/market/finnhub', () => ({ fallbackQuote: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIP } from '@/lib/api-helpers';
import { fallbackQuote } from '@/lib/market/finnhub';

const URL = 'http://localhost:3000/api/watchlist/radar';

// Dos filas del user, cada una con una señal unacked (ids del usuario).
const SIGNAL_ID_A = '11111111-1111-1111-1111-111111111111';
const SIGNAL_ID_B = '22222222-2222-2222-2222-222222222222';
// Un id de OTRO usuario — jamás debe salir en el .in() ni adjuntarse.
const FOREIGN_SIGNAL_ID = '99999999-9999-9999-9999-999999999999';

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    item_id: '00000000-0000-0000-0000-0000000000a1',
    watchlist_id: '00000000-0000-0000-0000-0000000000b1',
    ticker: 'AAPL',
    asset_type: 'equity',
    position: 0,
    notes: null,
    added_at: '2026-01-01T00:00:00Z',
    is_pinned: false,
    pinned_at: null,
    latest_analysis: null,
    previous_analysis: null,
    latest_unacked_signal: null,
    ...overrides,
  };
}

function signalJsonb(id: string) {
  return {
    id,
    level: 'urgente',
    timeframe: '1D',
    setup_detected: 'breakout',
    confidence_pct: 80,
    emitted_at: '2026-06-01T00:00:00Z',
  };
}

let outcomesBuilder: BuilderWithReturns;
let rpcFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimitByIP).mockResolvedValue(null);
  vi.mocked(fallbackQuote).mockResolvedValue(null as never);

  // RPC devuelve 2 filas del user, cada una con su señal (ids ya RLS-filtered).
  rpcFn = vi.fn(async () => ({
    data: [
      rpcRow({
        item_id: '00000000-0000-0000-0000-0000000000a1',
        ticker: 'AAPL',
        latest_unacked_signal: signalJsonb(SIGNAL_ID_A),
      }),
      rpcRow({
        item_id: '00000000-0000-0000-0000-0000000000a2',
        ticker: 'MSFT',
        latest_unacked_signal: signalJsonb(SIGNAL_ID_B),
      }),
    ],
    error: null,
  }));

  vi.mocked(createSupabaseServer).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    rpc: rpcFn,
  } as never);

  // Admin: from('signal_trade_outcomes').select('*').in('signal_id', ids)
  // Devuelve SOLO el outcome de la señal A (la B no tiene outcome aún).
  outcomesBuilder = withReturns(makeBuilder({
    then: {
      data: [
        {
          signal_id: SIGNAL_ID_A,
          outcome: 'target_hit',
          r_multiple: 2.5,
          return_pct: 12.3,
          resolved_days: 4,
          direction: 'long',
          entry: 100,
          entry_type: 'market',
          evaluated_at: '2026-06-05T00:00:00Z',
          exit_price: 112,
          stop_loss: 95,
          target: 112,
          timeframe: '1D',
        },
      ],
      error: null,
    },
  }));
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    from: vi.fn(() => outcomesBuilder),
  } as never);
});

describe('GET /api/watchlist/radar — outcome enrichment (F2)', () => {
  it('adjunta el outcome a la fila cuya señal lo tiene, y deja null la que no', async () => {
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    const rowA = body.rows.find((r: { ticker: string }) => r.ticker === 'AAPL');
    const rowB = body.rows.find((r: { ticker: string }) => r.ticker === 'MSFT');

    // Fila A: outcome subset adjuntado correctamente.
    expect(rowA.signal.id).toBe(SIGNAL_ID_A);
    expect(rowA.signal.outcome).toEqual({
      outcome: 'target_hit',
      r_multiple: 2.5,
      return_pct: 12.3,
      resolved_days: 4,
    });

    // Fila B: señal sin outcome evaluado → null (no rompe el radar).
    expect(rowB.signal.id).toBe(SIGNAL_ID_B);
    expect(rowB.signal.outcome).toBeNull();
  });

  it('ANTI-FUGA: la query de outcomes se acota con .in(signal_id, <ids del user>) — no trae ajenos', async () => {
    await GET({} as never);

    // Se consultó signal_trade_outcomes...
    const adminClient = vi.mocked(createSupabaseAdmin).mock.results[0]?.value as {
      from: ReturnType<typeof vi.fn>;
    };
    expect(adminClient.from).toHaveBeenCalledWith('signal_trade_outcomes');

    // ...acotada EXACTAMENTE a los signal.id que salieron de la RPC (RLS del user).
    expect(outcomesBuilder.in).toHaveBeenCalledTimes(1);
    const [col, ids] = outcomesBuilder.in.mock.calls[0] as [string, string[]];
    expect(col).toBe('signal_id');
    expect([...ids].sort()).toEqual([SIGNAL_ID_A, SIGNAL_ID_B].sort());
    // Ningún id ajeno se coló en el filtro.
    expect(ids).not.toContain(FOREIGN_SIGNAL_ID);
  });

  it('no consulta outcomes si no hay señales (ids vacío)', async () => {
    rpcFn.mockResolvedValueOnce({
      data: [rpcRow({ ticker: 'AAPL', latest_unacked_signal: null })],
      error: null,
    });
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    // Admin no se instancia cuando no hay ids que consultar.
    expect(vi.mocked(createSupabaseAdmin)).not.toHaveBeenCalled();
  });

  it('best-effort: si la lectura de outcomes falla, las filas quedan con outcome=null y el radar no rompe', async () => {
    outcomesBuilder.then = (resolve) =>
      Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve);
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const r of body.rows) {
      if (r.signal) expect(r.signal.outcome).toBeNull();
    }
  });
});
