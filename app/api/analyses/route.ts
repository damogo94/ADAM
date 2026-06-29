import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  extractTradeSummary,
  type TradeSummary,
  type TradeOutcomeSummary,
} from '@/lib/analyses/trade-summary';
import type { AnalysisLog } from '@/types/db';

export const runtime = 'nodejs';

/** Resumen de un run pasado + el trade que generó (si lo hizo) y su resultado. */
export interface AnalysisSummary {
  id: string;
  ticker: string;
  confluence_pct: number;
  net_pct: number | null;
  kappa: number | null;
  actionable_pct: number | null;
  direction: string;
  confidence: string;
  latency_ms: number | null;
  created_at: string;
  /** Operación accionable (entrada/SL/TP) o null si fue "solo análisis". */
  trade: TradeSummary | null;
  /** Resultado evaluado del trade (cron), o null si aún sin resolver/no-trade. */
  outcome: TradeOutcomeSummary | null;
}

type SummaryRow = Pick<
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
  | 'a3_output'
>;

// a3_output se trae para DERIVAR el trade server-side; NO se reenvía al cliente
// (se descarta en el map → payload pequeño aunque sean 50 filas).
const SUMMARY_COLUMNS =
  'id, ticker, confluence_pct, net_pct, kappa, actionable_pct, direction, confidence, latency_ms, created_at, a3_output';

/**
 * GET /api/analyses → últimos 50 runs del user (resumen + trade derivado + outcome).
 *
 * RLS (`analyses_select_own`) acota los runs al usuario via el client de SESIÓN.
 * Los resultados viven en `trade_outcomes` (service-role only, sin policies): se
 * leen con el admin client PERO acotados con `.in()` a los analysis_ids que YA
 * salieron con RLS → sin fuga entre usuarios (mismo patrón que /api/signals).
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
    .returns<SummaryRow[]>();

  if (error) {
    return NextResponse.json({ error: 'fetch_failed', detail: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  const outcomeById = new Map<string, TradeOutcomeSummary>();
  if (rows.length > 0) {
    const admin = createSupabaseAdmin();
    const { data: outcomes, error: oErr } = await admin
      .from('trade_outcomes')
      .select('analysis_id, outcome, r_multiple, return_pct, resolved_days')
      .in(
        'analysis_id',
        rows.map((r) => r.id)
      );
    // Best-effort: si falla la lectura de outcomes, devolvemos los trades sin
    // resultado (la UI los muestra como "en seguimiento") en vez de romper.
    if (!oErr) {
      for (const o of outcomes ?? []) {
        outcomeById.set(o.analysis_id, {
          outcome: o.outcome,
          r_multiple: o.r_multiple,
          return_pct: o.return_pct,
          resolved_days: o.resolved_days,
        });
      }
    }
  }

  const analyses: AnalysisSummary[] = rows.map(({ a3_output, ...rest }) => ({
    ...rest,
    trade: extractTradeSummary(a3_output),
    outcome: outcomeById.get(rest.id) ?? null,
  }));

  return NextResponse.json({ analyses });
}
