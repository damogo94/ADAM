/**
 * Tests del route handler GET /api/analyses/[id] — foco en el DUAL-SOURCE de
 * `trade_outcomes` (PK compuesta (analysis_id, source), migración 0018).
 *
 * Bug histórico: la lectura usaba `.maybeSingle()` sin filtrar por source, así que
 * en cuanto un análisis tenía las DOS filas (a3 + estructura) PostgREST devolvía
 * error y el outcome se volvía null en silencio. El fix lee ambas filas y las
 * separa en `outcome` (A3) + `estructuraOutcome` (Estructura).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeBuilder, type QueryBuilderMock } from '@/test/helpers/route';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

const ID = '11111111-1111-1111-1111-111111111111';

const ANALYSIS = {
  id: ID,
  ticker: 'MSFT',
  confluence_pct: 70,
  net_pct: null,
  kappa: null,
  actionable_pct: null,
  direction: 'positivo',
  confidence: 'media',
  latency_ms: 1000,
  created_at: '2026-07-01T00:00:00Z',
  a1_output: null,
  a2_output: null,
  a3_output: { operativa: { signal: 'buy', entry_type: 'market', entrada: 100, stop_loss: 95, target: 110, horizonte: 'swing' } },
  debate_output: null,
  a4_output: null,
  estructura_output: null,
};

let analysesBuilder: QueryBuilderMock;
let outcomesBuilder: QueryBuilderMock;

function mount(opts: { user?: { id: string } | null; analysis?: unknown; outcomes?: unknown[] } = {}) {
  const { user = { id: 'user-1' }, analysis = ANALYSIS, outcomes = [] } = opts;
  analysesBuilder = makeBuilder({ maybeSingle: { data: analysis, error: null } });
  outcomesBuilder = makeBuilder({ then: { data: outcomes, error: null } });
  vi.mocked(createSupabaseServer).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(() => analysesBuilder),
  } as never);
  vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => outcomesBuilder) } as never);
}

function ctx(id = ID) {
  return { params: { id } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/analyses/[id] — validación y auth', () => {
  it('400 con id no-uuid', async () => {
    mount();
    const res = await GET({} as never, ctx('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('401 sin usuario', async () => {
    mount({ user: null });
    const res = await GET({} as never, ctx());
    expect(res.status).toBe(401);
  });

  it('404 si el análisis no existe (o es ajeno por RLS)', async () => {
    mount({ analysis: null });
    const res = await GET({} as never, ctx());
    expect(res.status).toBe(404);
  });
});

describe('GET /api/analyses/[id] — dual-source outcomes', () => {
  it('dos filas (a3 + estructura) → outcome=A3, estructuraOutcome=Estructura (no null silencioso)', async () => {
    mount({
      outcomes: [
        { source: 'a3', outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 },
        { source: 'estructura', outcome: 'loss', r_multiple: -1, return_pct: -3, resolved_days: 8 },
      ],
    });
    const res = await GET({} as never, ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome).toEqual({ outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 });
    expect(body.estructuraOutcome).toEqual({ outcome: 'loss', r_multiple: -1, return_pct: -3, resolved_days: 8 });
  });

  it('solo fila A3 → outcome de A3, estructuraOutcome null', async () => {
    mount({ outcomes: [{ source: 'a3', outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 }] });
    const res = await GET({} as never, ctx());
    const body = await res.json();
    expect(body.outcome).toEqual({ outcome: 'win', r_multiple: 2, return_pct: 5, resolved_days: 10 });
    expect(body.estructuraOutcome).toBeNull();
  });

  it('solo fila Estructura → estructuraOutcome, outcome null', async () => {
    mount({ outcomes: [{ source: 'estructura', outcome: 'timeout', r_multiple: 0, return_pct: 1, resolved_days: 30 }] });
    const res = await GET({} as never, ctx());
    const body = await res.json();
    expect(body.outcome).toBeNull();
    expect(body.estructuraOutcome).toEqual({ outcome: 'timeout', r_multiple: 0, return_pct: 1, resolved_days: 30 });
  });

  it('acota la lectura de outcomes a este analysis_id', async () => {
    mount();
    await GET({} as never, ctx());
    expect(outcomesBuilder.eq).toHaveBeenCalledWith('analysis_id', ID);
  });
});
