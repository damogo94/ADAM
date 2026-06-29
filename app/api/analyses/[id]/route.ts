import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { TradeOutcomeSummary } from '@/lib/analyses/trade-summary';

export const runtime = 'nodejs';

const Uuid = z.string().uuid();

const DETAIL_COLUMNS =
  'id, ticker, confluence_pct, net_pct, kappa, actionable_pct, direction, confidence, latency_ms, created_at, a1_output, a2_output, a3_output, debate_output, a4_output, estructura_output';

/**
 * GET /api/analyses/[id] → un run PROPIO completo (outputs JSONB) + el outcome
 * del trade si ya se evaluó.
 *
 * RLS (`analyses_select_own`) garantiza que `data` es del usuario autenticado (un
 * id ajeno cae a not_found). El outcome vive en `trade_outcomes` (service-role,
 * sin RLS): se lee con admin acotado a este analysis_id, que YA está validado
 * como del usuario por la query anterior → sin fuga.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = Uuid.safeParse(params.id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('analyses_log')
    .select(DETAIL_COLUMNS)
    .eq('id', parsed.data)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let outcome: TradeOutcomeSummary | null = null;
  try {
    const admin = createSupabaseAdmin();
    const { data: o } = await admin
      .from('trade_outcomes')
      .select('outcome, r_multiple, return_pct, resolved_days')
      .eq('analysis_id', parsed.data)
      .maybeSingle();
    outcome = o ?? null;
  } catch {
    /* best-effort: el outcome es opcional para el render */
  }

  return NextResponse.json({ analysis: data, outcome });
}
