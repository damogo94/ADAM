import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIP } from '@/lib/api-helpers';
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
 * id ajeno cae a not_found). Los outcomes viven en `trade_outcomes` (service-role,
 * sin RLS): se leen con admin acotado a este analysis_id, que YA está validado
 * como del usuario por la query anterior → sin fuga. Puede haber DOS filas (PK
 * compuesta (analysis_id, source)): se separan en `outcome` (A3) + `estructuraOutcome`.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

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
  let estructuraOutcome: TradeOutcomeSummary | null = null;
  try {
    const admin = createSupabaseAdmin();
    // Ambas fuentes (a3 + estructura). NO `.maybeSingle()`: con dos filas PostgREST
    // devolvería error y perderíamos TODO outcome (incluido el de A3) en silencio.
    const { data: rows } = await admin
      .from('trade_outcomes')
      .select('source, outcome, r_multiple, return_pct, resolved_days')
      .eq('analysis_id', parsed.data)
      .in('source', ['a3', 'estructura']);
    for (const o of rows ?? []) {
      const summary: TradeOutcomeSummary = {
        outcome: o.outcome,
        r_multiple: o.r_multiple,
        return_pct: o.return_pct,
        resolved_days: o.resolved_days,
      };
      if (o.source === 'estructura') estructuraOutcome = summary;
      else outcome = summary;
    }
  } catch {
    /* best-effort: el outcome es opcional para el render */
  }

  return NextResponse.json({ analysis: data, outcome, estructuraOutcome });
}
