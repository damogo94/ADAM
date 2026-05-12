import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { runCMT } from '@/agents/cmt/client';
import {
  timeSeriesDaily,
  timeSeriesIntraday,
  normalizeDaily,
  normalizeIntraday,
} from '@/lib/market/alphavantage';
import type { CMTOutput } from '@/agents/cmt/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Scanner CMT — corre sobre la watchlist del usuario autenticado y persiste
 * cada signal en signals_history.
 *
 * Auth:
 *   - User autenticado (cookie session): escanea su propia watchlist
 *   - Cron (Authorization: Bearer ${CRON_SECRET}): no implementado aún —
 *     escanearia todos los usuarios. Sprint 2.5.
 *
 * Coste por scan: N tickers × (2 calls Alpha Vantage + 1 call Haiku).
 * Pensado para correr 1×/5min en cron (Vercel) — sin caché es caro,
 * por eso Sprint 3 mete Upstash para amortiguar.
 */
export async function POST(req: NextRequest) {
  // Auth path A: cron via CRON_SECRET (no implementado aun, placeholder)
  const cronAuth = req.headers.get('authorization');
  if (cronAuth && process.env.CRON_SECRET && cronAuth === `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'cron_path_not_implemented', detail: 'Sprint 2.5: scan multi-user' },
      { status: 501 }
    );
  }

  // Auth path B: user autenticado
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Cargar watchlist items del user
  const { data: watchlist } = await supabase
    .from('watchlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle<{ id: string }>();
  if (!watchlist) return NextResponse.json({ scanned: 0, signals: [] });

  const { data: items } = await supabase
    .from('watchlist_items')
    .select('ticker')
    .eq('watchlist_id', watchlist.id)
    .returns<{ ticker: string }[]>();
  const tickers = (items ?? []).map((it) => it.ticker);
  if (tickers.length === 0) return NextResponse.json({ scanned: 0, signals: [] });

  // Escanear cada ticker — secuencial para no quemar AV free-tier (5/min)
  const results: { ticker: string; ok: boolean; signal?: CMTOutput; error?: string }[] = [];
  for (const ticker of tickers) {
    try {
      const [daily, intraday] = await Promise.all([
        timeSeriesDaily(ticker).then(normalizeDaily).catch(() => []),
        timeSeriesIntraday(ticker, '60min').then((d) => normalizeIntraday(d, '60min')).catch(() => []),
      ]);
      const ohlcv = [
        { timeframe: '1D', candles: daily.slice(-100) },
        { timeframe: '1H', candles: intraday.slice(-100) },
      ];
      const signal = await runCMT({ ticker, ohlcv });
      results.push({ ticker, ok: true, signal });
    } catch (err) {
      results.push({
        ticker,
        ok: false,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // Persistir las signals NO sin_senal — el ruido se filtra antes del DB
  const admin = createSupabaseAdmin();
  const toInsert = results
    .filter((r) => r.ok && r.signal && r.signal.level !== 'sin_senal')
    .map((r) => {
      const s = r.signal!;
      return {
        user_id: user.id,
        ticker: s.ticker,
        level: s.level,
        timeframe: s.timeframe,
        setup_detected: s.setup_detected,
        confidence_pct: s.confidence_pct,
        entry_price: s.entry_price,
        stop_loss: s.stop_loss,
        target_price: s.target_price,
        risk_reward_ratio: s.risk_reward_ratio,
        invalidation_factor: s.invalidation_factor,
        indicators: s.indicators,
      };
    });

  if (toInsert.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await admin.from('signals_history').insert(toInsert as any);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[cmt-scan] failed to insert signals:', error.message);
    }
  }

  return NextResponse.json({
    scanned: results.length,
    persisted: toInsert.length,
    results,
  });
}
