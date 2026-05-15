import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { runCMT } from '@/agents/cmt/client';
import { fallbackDaily, fallbackIntraday } from '@/lib/market/finnhub';
import { checkSameOrigin } from '@/lib/api-helpers';
import type { CMTOutput } from '@/agents/cmt/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Scanner CMT — dos modos:
 *
 * A) MANUAL: usuario autenticado (cookie session) → escanea SU watchlist default
 *    POST /api/cmt/scan
 *
 * B) CRON: Vercel cron via header `Authorization: Bearer ${CRON_SECRET}` →
 *    itera TODAS las watchlists de TODOS los users, escanea, persiste por user_id.
 *    Vercel cron manda el header automaticamente cuando CRON_SECRET esta en env.
 *
 * Estrategia anti-spam Yahoo (sin cuota oficial pero no abusar):
 *   - 1s entre tickers (politeness, no rate-limit hard)
 *   - circuit breaker: 3 fallos consecutivos → break del loop
 *
 * Persiste solo signals NO `sin_senal` para no ruido en /signals.
 */

// Antes 13s para no quemar AV (5/min). Yahoo no tiene cuota free oficial
// pero 1s entre llamadas es buena ciudadanía y respeta el lambda timeout.
const SLEEP_MS_BETWEEN_TICKERS = 1_000;
const MAX_CONSECUTIVE_FAILS = 3;

interface ScanResult {
  ticker: string;
  ok: boolean;
  signal?: CMTOutput;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scanTickerForUser(userId: string, ticker: string): Promise<ScanResult> {
  try {
    // Yahoo /v8/chart sirve daily + intraday sin auth ni cuota práctica.
    const [daily, intraday] = await Promise.all([
      fallbackDaily(ticker).catch(() => []),
      fallbackIntraday(ticker).catch(() => []),
    ]);
    if (daily.length === 0 && intraday.length === 0) {
      return { ticker, ok: false, error: 'no_market_data' };
    }
    const ohlcv = [
      { timeframe: '1D', candles: daily.slice(-100) },
      { timeframe: '1H', candles: intraday.slice(-100) },
    ];
    const signal = await runCMT({ ticker, ohlcv });
    return { ticker, ok: true, signal };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return { ticker, ok: false, error: msg };
  }
}

async function persistSignals(userId: string, results: ScanResult[]): Promise<number> {
  const admin = createSupabaseAdmin();
  const toInsert = results
    .filter((r) => r.ok && r.signal && r.signal.level !== 'sin_senal')
    .map((r) => {
      const s = r.signal!;
      return {
        user_id: userId,
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

  if (toInsert.length === 0) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin.from('signals_history').insert(toInsert as any);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[cmt-scan] persist failed:', error.message);
    return 0;
  }
  return toInsert.length;
}

export async function POST(req: NextRequest) {
  const cronAuth = req.headers.get('authorization');
  const isCron =
    !!cronAuth &&
    !!process.env.CRON_SECRET &&
    cronAuth === `Bearer ${process.env.CRON_SECRET}`;

  if (isCron) {
    return handleCron();
  }

  // CSRF aplica SOLO en path manual — cron viene de Vercel sin Origin
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  return handleManual();
}

/**
 * GET también soportado para cron — Vercel cron por defecto usa GET.
 */
export async function GET(req: NextRequest) {
  const cronAuth = req.headers.get('authorization');
  const isCron =
    !!cronAuth &&
    !!process.env.CRON_SECRET &&
    cronAuth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    return NextResponse.json({ error: 'method_not_allowed', detail: 'GET solo para cron autenticado' }, { status: 405 });
  }
  return handleCron();
}

async function handleManual() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: watchlist } = await supabase
    .from('watchlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle<{ id: string }>();
  if (!watchlist) return NextResponse.json({ scanned: 0, persisted: 0, results: [] });

  const { data: items } = await supabase
    .from('watchlist_items')
    .select('ticker')
    .eq('watchlist_id', watchlist.id)
    .returns<{ ticker: string }[]>();
  const tickers = (items ?? []).map((it) => it.ticker);

  const { results } = await runScanLoop(user.id, tickers);
  const persisted = await persistSignals(user.id, results);

  return NextResponse.json({ scanned: results.length, persisted, results });
}

async function handleCron() {
  // Cron itera TODAS las watchlists default. Service role bypasses RLS para leer cross-user.
  const admin = createSupabaseAdmin();
  const wlRes = await admin
    .from('watchlists')
    .select('id, user_id')
    .eq('is_default', true);
  const watchlists = (wlRes.data ?? []) as unknown as { id: string; user_id: string }[];

  if (watchlists.length === 0) {
    return NextResponse.json({ users_scanned: 0, total_persisted: 0 });
  }

  let totalScanned = 0;
  let totalPersisted = 0;
  const errors: { user_id: string; error: string }[] = [];

  for (const wl of watchlists) {
    try {
      const itemsRes = await admin
        .from('watchlist_items')
        .select('ticker')
        .eq('watchlist_id', wl.id);
      const items = (itemsRes.data ?? []) as unknown as { ticker: string }[];
      const tickers = items.map((it) => it.ticker);
      if (tickers.length === 0) continue;

      const { results } = await runScanLoop(wl.user_id, tickers);
      totalScanned += results.length;
      totalPersisted += await persistSignals(wl.user_id, results);
    } catch (err) {
      errors.push({ user_id: wl.user_id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({
    users_scanned: watchlists.length,
    total_scanned: totalScanned,
    total_persisted: totalPersisted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function runScanLoop(userId: string, tickers: string[]): Promise<{ results: ScanResult[] }> {
  const results: ScanResult[] = [];
  let avFailStreak = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;
    const r = await scanTickerForUser(userId, ticker);
    results.push(r);

    if (!r.ok && (r.error?.includes('soft error') || r.error?.includes('rate-limited'))) {
      avFailStreak++;
      if (avFailStreak >= MAX_CONSECUTIVE_FAILS) {
        // eslint-disable-next-line no-console
        console.warn(`[cmt-scan] AV throttling streak (${avFailStreak}), breaking scan at ticker ${i + 1}/${tickers.length}`);
        break;
      }
    } else if (r.ok) {
      avFailStreak = 0;
    }

    // Spacing entre tickers — respeta AV 5/min con margen
    if (i < tickers.length - 1) await sleep(SLEEP_MS_BETWEEN_TICKERS);
  }

  return { results };
}
