/**
 * Tests del route handler GET /api/analyses — foco en el DUAL-SOURCE de
 * `trade_outcomes` (migración 0018: PK compuesta (analysis_id, source)).
 *
 * Invariante: un análisis puede tener DOS filas de outcome (source 'a3' y
 * 'estructura'). El endpoint debe keyear por (analysis_id, source) y devolver
 * `outcome` (A3) + `estructuraOutcome` (Estructura) por separado — nunca
 * last-row-wins ni cruzar el outcome de una fuente sobre la otra.
 *
 * Anti-fuga (mismo patrón que /api/signals y el radar): los outcomes viven en
 * `trade_outcomes` (service-role) y se leen con admin acotados con
 * `.in('analysis_id', ids)` donde los ids salen de filas ya RLS-filtered.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeBuilder, type QueryBuilderMock } from '@/test/helpers/route';

/** El route usa `.returns<T>()` tras la query de analyses_log; el harness base no lo mockea. */
type BuilderWithReturns = QueryBuilderMock & { returns: ReturnType<typeof vi.fn> };
function withReturns(b: QueryBuilderMock): BuilderWithReturns {
  const bb = b as BuilderWithReturns;
  bb.returns = vi.fn(() => bb);
  return bb;
}

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/api-helpers', () => ({ rateLimitByIP: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIP } from '@/lib/api-helpers';

/** operativa A3 accionable (buy swing con geometría coherente) → genera trade. */
const A3_ACTIONABLE = {
  operativa: {
    signal: 'buy',
    entry_type: 'market',
    entrada: 100,
    stop_loss: 95,
    target: 110,
    ratio_riesgo_beneficio: 2,
    horizonte: 'swing',
  },
};
const A3_HOLD = { operativa: { signal: 'hold', entrada: null, stop_loss: null, target: null, horizonte: 'swing' } };

/** estructura_output accionable (setup listo, compra swing con geometría coherente). */
const ESTRUCTURA_ACTIONABLE = {
  setup: { direccion: 'compra', timeframe_entrada: '1D', estado: 'listo' },
  gestion: { entrada: 100, entry_type: 'market', stop_loss: 95, take_profit: 110, ratio_riesgo_beneficio: 2 },
};

function scalars(id: string, ticker: string) {
  return {
    id,
    ticker,
    confluence_pct: 70,
    net_pct: null,
    kappa: null,
    actionable_pct: null,
    direction: 'positivo',
    confidence: 'media',
    latency_ms: 1000,
    created_at: '2026-07-01T00:00:00Z',
  };
}

const ROWS = [
  { ...scalars('an-a3', 'AAPL'), a3_output: A3_ACTIONABLE, estructura_output: null },
  { ...scalars('an-both', 'MSFT'), a3_output: A3_ACTIONABLE, estructura_output: ESTRUCTURA_ACTIONABLE },
  { ...scalars('an-estru', 'BTC-USD'), a3_output: A3_HOLD, estructura_output: ESTRUCTURA_ACTIONABLE },
];

// Orden [a3, estructura] a propósito: con last-row-wins (bug) `an-both` cogería
// el outcome de Estructura como `outcome`; el fix debe keyear por source.
const OUTCOMES = [
  { analysis_id: 'an-a3', source: 'a3', outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 },
  { analysis_id: 'an-both', source: 'a3', outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 },
  { analysis_id: 'an-both', source: 'estructura', outcome: 'loss', r_multiple: -1, return_pct: -3, resolved_days: 8 },
  { analysis_id: 'an-estru', source: 'estructura', outcome: 'timeout', r_multiple: 0, return_pct: 1, resolved_days: 30 },
];

let analysesBuilder: BuilderWithReturns;
let outcomesBuilder: QueryBuilderMock;

function mount(opts: { user?: { id: string } | null; rows?: unknown[]; outcomes?: unknown[] } = {}) {
  const { user = { id: 'user-1' }, rows = ROWS, outcomes = OUTCOMES } = opts;
  analysesBuilder = withReturns(makeBuilder({ then: { data: rows, error: null } }));
  outcomesBuilder = makeBuilder({ then: { data: outcomes, error: null } });
  vi.mocked(createSupabaseServer).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(() => analysesBuilder),
  } as never);
  vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => outcomesBuilder) } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimitByIP).mockResolvedValue(null);
});

describe('GET /api/analyses — auth', () => {
  it('401 sin usuario', async () => {
    mount({ user: null });
    const res = await GET({} as never);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/analyses — dual-source outcomes por (analysis_id, source)', () => {
  it('an-both: outcome = A3 (win), estructuraOutcome = Estructura (loss) — no last-row-wins', async () => {
    mount();
    const res = await GET({} as never);
    const body = await res.json();
    const byId = Object.fromEntries(body.analyses.map((a: { id: string }) => [a.id, a]));

    expect(byId['an-both'].outcome).toEqual({ outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 });
    expect(byId['an-both'].estructuraOutcome).toEqual({ outcome: 'loss', r_multiple: -1, return_pct: -3, resolved_days: 8 });
  });

  it('an-estru (A3 hold): el outcome de Estructura NO se mapea como outcome de A3', async () => {
    mount();
    const res = await GET({} as never);
    const body = await res.json();
    const byId = Object.fromEntries(body.analyses.map((a: { id: string }) => [a.id, a]));

    expect(byId['an-estru'].outcome).toBeNull();
    expect(byId['an-estru'].estructuraOutcome).toEqual({ outcome: 'timeout', r_multiple: 0, return_pct: 1, resolved_days: 30 });
    expect(byId['an-estru'].trade).toBeNull(); // A3 = hold → sin trade primario
    expect(byId['an-estru'].estructuraTrade?.source).toBe('estructura');
  });

  it('an-a3 (solo A3): outcome de A3, estructuraOutcome null', async () => {
    mount();
    const res = await GET({} as never);
    const body = await res.json();
    const byId = Object.fromEntries(body.analyses.map((a: { id: string }) => [a.id, a]));

    expect(byId['an-a3'].outcome).toEqual({ outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 });
    expect(byId['an-a3'].estructuraOutcome).toBeNull();
    expect(byId['an-a3'].trade?.source).toBe('a3');
  });
});

describe('GET /api/analyses — anti-fuga', () => {
  it('acota la lectura de outcomes con .in(analysis_id, <ids de las filas RLS>)', async () => {
    mount();
    await GET({} as never);
    expect(outcomesBuilder.in).toHaveBeenCalledTimes(1);
    const [col, ids] = outcomesBuilder.in.mock.calls[0] as [string, string[]];
    expect(col).toBe('analysis_id');
    expect([...ids].sort()).toEqual(['an-a3', 'an-both', 'an-estru']);
  });

  it('best-effort: si falla la lectura de outcomes, los trades salen sin resultado', async () => {
    mount();
    outcomesBuilder.then = ((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve)) as QueryBuilderMock['then'];
    const res = await GET({} as never);
    const body = await res.json();
    for (const a of body.analyses) {
      expect(a.outcome).toBeNull();
      expect(a.estructuraOutcome).toBeNull();
    }
  });
});
