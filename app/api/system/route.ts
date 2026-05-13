import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

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
}

// Tarifas oficiales Anthropic 2026 — agregadas para estimacion grosso modo.
// Como no separamos tokens por modelo en `analyses_log`, usamos blended rate
// 70% Sonnet (A1/A2/A3) + 30% Opus (A4 + Debate ocasional).
const BLENDED_USD_PER_MTOK = 0.7 * (3 + 15) / 2 + 0.3 * (15 + 75) / 2; // ~$19.8/MTok blended

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
      .select('confluence_pct, latency_ms, tokens_used, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<{ confluence_pct: number; latency_ms: number | null; tokens_used: number | null; created_at: string }[]>(),
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
  const tokensTotal = analyses.reduce((acc, a) => acc + (a.tokens_used ?? 0), 0);
  const costUsd = (tokensTotal / 1_000_000) * BLENDED_USD_PER_MTOK;

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
  };

  return NextResponse.json(stats);
}
