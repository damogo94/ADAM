import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { summarize, type UsageRow, type AgentAggregate } from '@/lib/cost';

export const runtime = 'nodejs';

interface SystemStats {
  analyses_total: number;
  signals_total: number;
  signals_urgentes: number;
  avg_confluence_pct: number;
  avg_latency_ms: number;
  last_analysis_at: string | null;
  watchlist_tickers: number;
  tokens_total: number;
  cost_usd_estimated: number;
  /**
   * Desglose por agente (PR4 observabilidad). Vacío para usuarios sin
   * runs persistidos con `usage_breakdown` (= sin runs post 2026-05-20).
   */
  by_agent: AgentAggregate[];
}

// Fallback blended para runs antiguos que NO tienen usage_breakdown
// (anteriores a migración 0005). 70% Sonnet + 30% Opus.
const FALLBACK_BLENDED_USD_PER_MTOK = 0.7 * (3 + 15) / 2 + 0.3 * (15 + 75) / 2;

/**
 * GET /api/system → métricas agregadas del usuario autenticado.
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [analysesRes, signalsRes, watchlistsRes] = await Promise.all([
    supabase
      .from('analyses_log')
      .select('confluence_pct, latency_ms, tokens_used, usage_breakdown, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<{
        confluence_pct: number;
        latency_ms: number | null;
        tokens_used: number | null;
        usage_breakdown: UsageRow[] | null;
        created_at: string;
      }[]>(),
    supabase
      .from('signals_history')
      .select('level')
      .eq('user_id', user.id)
      .limit(500)
      .returns<{ level: string }[]>(),
    supabase
      .from('watchlists')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle<{ id: string }>(),
  ]);

  const analyses = analysesRes.data ?? [];
  const signals = signalsRes.data ?? [];

  const avgConfluence = analyses.length
    ? Math.round(analyses.reduce((acc, a) => acc + (a.confluence_pct ?? 0), 0) / analyses.length)
    : 0;
  const latencies = analyses.map((a) => a.latency_ms).filter((n): n is number => typeof n === 'number');
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  // Coste exacto por agente cuando hay usage_breakdown; fallback blended
  // para runs antiguos sin la columna poblada.
  const allUsages: UsageRow[] = [];
  let legacyTokens = 0;
  for (const a of analyses) {
    if (a.usage_breakdown && Array.isArray(a.usage_breakdown) && a.usage_breakdown.length > 0) {
      allUsages.push(...a.usage_breakdown);
    } else {
      legacyTokens += a.tokens_used ?? 0;
    }
  }
  const breakdown = summarize(allUsages);
  const legacyCostUsd = (legacyTokens / 1_000_000) * FALLBACK_BLENDED_USD_PER_MTOK;
  const tokensTotal = breakdown.total_tokens + legacyTokens;
  const costUsd = breakdown.total_cost_usd + legacyCostUsd;

  let watchlistTickers = 0;
  if (watchlistsRes.data) {
    const { count } = await supabase
      .from('watchlist_items')
      .select('*', { count: 'exact', head: true })
      .eq('watchlist_id', watchlistsRes.data.id);
    watchlistTickers = count ?? 0;
  }

  const stats: SystemStats = {
    analyses_total: analyses.length,
    signals_total: signals.length,
    signals_urgentes: signals.filter((s) => s.level === 'urgente').length,
    avg_confluence_pct: avgConfluence,
    avg_latency_ms: avgLatency,
    last_analysis_at: analyses[0]?.created_at ?? null,
    watchlist_tickers: watchlistTickers,
    tokens_total: tokensTotal,
    cost_usd_estimated: Number(costUsd.toFixed(4)),
    by_agent: breakdown.by_agent,
  };

  return NextResponse.json(stats);
}
