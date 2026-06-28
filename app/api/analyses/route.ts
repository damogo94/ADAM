import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { AnalysisLog } from '@/types/db';

export const runtime = 'nodejs';

/** Resumen de un run pasado (sin los outputs JSONB pesados — esos van en /[id]). */
export type AnalysisSummary = Pick<
  AnalysisLog,
  | 'id'
  | 'ticker'
  | 'confluence_pct'
  | 'net_pct'
  | 'kappa'
  | 'actionable_pct'
  | 'direction'
  | 'confidence'
  | 'latency_ms'
  | 'created_at'
>;

const SUMMARY_COLUMNS =
  'id, ticker, confluence_pct, net_pct, kappa, actionable_pct, direction, confidence, latency_ms, created_at';

/**
 * GET /api/analyses → últimos 50 runs del user autenticado (solo resumen).
 *
 * RLS (`analyses_select_own`: user_id = auth.uid()) acota al propio usuario, así
 * que basta el client de SESIÓN (no admin) — el historial es estrictamente
 * personal. Inserts siguen siendo service-role (en /api/agents/run); aquí solo
 * leemos. Índice `analyses_log_user_created_idx (user_id, created_at desc)`.
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('analyses_log')
    .select(SUMMARY_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<AnalysisSummary[]>();

  if (error) {
    return NextResponse.json({ error: 'fetch_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ analyses: data ?? [] });
}
