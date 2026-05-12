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
}

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
      .select('confluence_pct, latency_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<{ confluence_pct: number; latency_ms: number | null; created_at: string }[]>(),
    supabase
      .from('signals_history')
      .select('level')
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
  };

  return NextResponse.json(stats);
}
