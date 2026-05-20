/**
 * /api/cron/watchlist-scan — Pre-genera análisis para los activos de la
 * watchlist por defecto de cada usuario. (PR D1)
 *
 * Disparado por Vercel Cron 1x/día a las 21:30 UTC (antes del de
 * evaluate-signals a las 22:00).
 *
 * Comportamiento:
 *  - Para cada usuario con watchlist por defecto, toma sus primeros N
 *    activos (CAP_TICKERS_PER_USER) ordenados por position.
 *  - Skip si ya hay un análisis del par (user, ticker) en las últimas
 *    SKIP_RECENT_HOURS — evita duplicar work si el user lo lanzó manualmente.
 *  - Para cada ticker pasa el flujo completo de runADAM y persiste en
 *    analyses_log (mismo formato que /api/agents/run).
 *  - Stop temprano si los primeros EARLY_STOP_FAILS fallan: indica problema
 *    sistémico (Anthropic down, Finnhub down) y no tiene sentido seguir.
 *
 * NO emite signals_history en D1. La heurística de emisión llegará en D2
 * con datos reales del scan para no spamear señales ruido.
 *
 * Seguridad: protegido con CRON_SECRET (Bearer). Mismo patrón que el cron
 * de evaluate-signals.
 *
 * Budget: el cap global por ejecución es N_usuarios × CAP_TICKERS_PER_USER
 * × ~5 LLM calls. Con 1 usuario × 10 tickers = ~50 calls/día. Por usuario,
 * eso son ~$0.30/día con el blended Sonnet/Opus actual.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { runForUser, hasRecentAnalysis } from '@/lib/pipeline-runner';

export const runtime = 'nodejs';
// Vercel maxDuration es por invocación. Un scan completo puede tomar
// 10 tickers × ~25s/run = 250s peak. Vercel hobby plan limita a 60s/lambda,
// pro a 300s. Si pasa, la lambda se corta y el siguiente cron retoma
// (skip de "recent analysis" maneja la idempotencia).
export const maxDuration = 300;

const CAP_TICKERS_PER_USER = 10;
const SKIP_RECENT_HOURS = 18;
const EARLY_STOP_FAILS = 3;

interface UserRow {
  user_id: string;
  watchlist_id: string;
}

interface ItemRow {
  ticker: string;
  position: number;
}

interface ScanResult {
  user_id: string;
  ticker: string;
  outcome: 'analyzed' | 'skipped_recent' | 'failed';
  detail?: string;
  tokens_used?: number;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const results: ScanResult[] = [];
  let consecutiveFails = 0;

  // 1. Lista usuarios con watchlist default.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: defaultLists, error: wlErr } = await (admin
    .from('watchlists')
    .select('id, user_id')
    .eq('is_default', true) as any);

  if (wlErr) {
    Sentry.captureMessage('cron watchlist-scan watchlists query failed', {
      extra: { error: wlErr.message },
    });
    return NextResponse.json({ error: 'watchlists_query_failed', detail: wlErr.message }, { status: 500 });
  }

  const users: UserRow[] = ((defaultLists ?? []) as { id: string; user_id: string }[]).map((w) => ({
    user_id: w.user_id,
    watchlist_id: w.id,
  }));

  // 2. Por cada usuario, escanea sus primeros N tickers
  for (const u of users) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (admin
      .from('watchlist_items')
      .select('ticker, position')
      .eq('watchlist_id', u.watchlist_id)
      .order('position', { ascending: true })
      .limit(CAP_TICKERS_PER_USER) as any);

    const tickers: ItemRow[] = (items ?? []) as ItemRow[];
    if (tickers.length === 0) continue;

    for (const it of tickers) {
      // Early stop si está fallando todo (problema sistémico)
      if (consecutiveFails >= EARLY_STOP_FAILS) {
        results.push({
          user_id: u.user_id,
          ticker: it.ticker,
          outcome: 'failed',
          detail: 'early_stop_systemic',
        });
        continue;
      }

      // Skip si ya analizamos esto recientemente
      const recent = await hasRecentAnalysis(u.user_id, it.ticker, SKIP_RECENT_HOURS).catch(() => false);
      if (recent) {
        results.push({ user_id: u.user_id, ticker: it.ticker, outcome: 'skipped_recent' });
        continue;
      }

      const outcome = await runForUser(u.user_id, it.ticker);
      if (outcome.ok) {
        consecutiveFails = 0;
        results.push({
          user_id: u.user_id,
          ticker: it.ticker,
          outcome: 'analyzed',
          tokens_used: outcome.tokens_used,
        });
      } else {
        consecutiveFails += 1;
        results.push({
          user_id: u.user_id,
          ticker: it.ticker,
          outcome: 'failed',
          detail: `${outcome.error}: ${outcome.detail}`,
        });
      }
    }
  }

  const analyzed = results.filter((r) => r.outcome === 'analyzed').length;
  const skipped = results.filter((r) => r.outcome === 'skipped_recent').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;
  const totalTokens = results.reduce((acc, r) => acc + (r.tokens_used ?? 0), 0);

  // eslint-disable-next-line no-console
  console.log(
    `[cron] watchlist-scan done · analyzed=${analyzed} · skipped=${skipped} · failed=${failed} · tokens=${totalTokens}`
  );

  return NextResponse.json({
    users_scanned: users.length,
    analyzed,
    skipped_recent: skipped,
    failed,
    total_tokens: totalTokens,
    results,
  });
}
