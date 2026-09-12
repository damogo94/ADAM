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
 *  - Skip de tickers NO crypto en sábado/domingo UTC (`skipped_weekend`, R13):
 *    los mercados están cerrados y la vela diaria no cambia, así que el
 *    análisis sería un duplicado que solo infla filas correlacionadas en
 *    analyses_log/signal_outcomes. Crypto cotiza 24/7 y sigue pasando.
 *    Parametrizable con WATCHLIST_SCAN_SKIP_WEEKEND (default ON; '0'/'false'
 *    lo apaga).
 *  - Presupuesto de tiempo (R6): antes de lanzar cada ticker comprueba que
 *    quepa una corrida entera (EST_MS_PER_TICKER) dentro de TIME_BUDGET_MS;
 *    si no, marca ese y los restantes como `skipped_budget` y corta con log.
 *    Sin esto, con maxDuration 300s y ~5 tickers a ~75s, el 5º se cortaba a
 *    mitad (fila perdida + tokens gastados sin persistir).
 *  - Para cada ticker pasa el flujo completo de runADAM y persiste en
 *    analyses_log (mismo formato que /api/agents/run). A2 se narra inline con
 *    A2_TIMEOUT_MS (45s, R4): a 25s fallaba en ~87% de las filas del cron.
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
import { requireCronSecret } from '@/lib/api-helpers';
import { runForUser, hasRecentAnalysis } from '@/lib/pipeline-runner';
import { isCryptoTicker } from '@/lib/market/crypto-registry';

export const runtime = 'nodejs';
// Vercel maxDuration es por invocación (300s aquí; los crons corren con ese
// techo, no con los 60s de las lambdas de usuario). Un ticker con A2 a 45s
// cuesta ~75s worst-case sin reintentos y ~90s si el SDK reintenta A2 (ver el
// presupuesto en agents/pipeline.ts), así que caben ~3 tickers por corrida
// dentro de TIME_BUDGET_MS. Lo que no cabe se marca `skipped_budget` y lo
// retoma el siguiente cron (el skip de "recent analysis" maneja la
// idempotencia). Pendiente (T3): contrastar `duration_ms` real por ticker tras
// recargar crédito y ajustar EST_MS_PER_TICKER con datos.
export const maxDuration = 300;

const CAP_TICKERS_PER_USER = 10;
const SKIP_RECENT_HOURS = 18;
const EARLY_STOP_FAILS = 3;

/**
 * R4 · Timeout de A2 inline en el cron. 45s es el único valor con evidencia
 * (app/api/agents/a2/route.ts usa 45s en su lambda dedicado). Solo afecta a
 * narrateA2 (vía RunADAMOptions.a2TimeoutMs); DEFAULT_TIMEOUT_MS y /run intactos.
 */
const A2_TIMEOUT_MS = 45_000;

/**
 * R6 · Presupuesto de tiempo, como en a2-reconcile: corta antes de que Vercel
 * mate el lambda (300s). EST_MS_PER_TICKER es el worst-case de una corrida
 * completa con A2 a 45s (~5s datos + 45s A1/A2/A3 en paralelo + ~15s Debate
 * + ~6s A4 + overhead ≈ 75s) MÁS el margen del reintento del SDK sobre A2
 * (maxRetries:1 en lib/anthropic.ts sí reintenta timeouts → hasta ~90s). Con
 * 240s de presupuesto siguen cabiendo 3 tickers; el último aceptado arranca
 * como tarde a ~150s y termina antes de los 300s aunque Debate o A4 reintenten.
 */
const TIME_BUDGET_MS = 240_000;
const EST_MS_PER_TICKER = 90_000;

interface UserRow {
  user_id: string;
  watchlist_id: string;
}

interface ItemRow {
  ticker: string;
  position: number;
}

type ScanOutcome =
  | 'analyzed'
  | 'skipped_recent'
  | 'skipped_weekend'
  | 'skipped_budget'
  | 'failed';

interface ScanResult {
  user_id: string;
  ticker: string;
  outcome: ScanOutcome;
  detail?: string;
  tokens_used?: number;
}

/** R13 · Default ON; solo '0' / 'false' (case-insensitive) lo apagan. */
function skipWeekendEnabled(): boolean {
  const raw = process.env.WATCHLIST_SCAN_SKIP_WEEKEND;
  if (raw === undefined) return true;
  const v = raw.trim().toLowerCase();
  return !(v === '0' || v === 'false');
}

/** Sábado (6) o domingo (0) en UTC — el cron corre a las 21:30 UTC. */
function isWeekendUTC(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;

  const t0 = Date.now();
  const admin = createSupabaseAdmin();
  const results: ScanResult[] = [];
  let consecutiveFails = 0;
  let budgetExhausted = false;
  const weekend = skipWeekendEnabled() && isWeekendUTC(new Date(t0));

  // 1. Lista usuarios con watchlist default.
  const { data: defaultLists, error: wlErr } = await admin
    .from('watchlists')
    .select('id, user_id')
    .eq('is_default', true);

  if (wlErr) {
    Sentry.captureMessage('cron watchlist-scan watchlists query failed', {
      extra: { error: wlErr.message },
    });
    return NextResponse.json({ error: 'watchlists_query_failed', detail: wlErr.message }, { status: 500 });
  }

  const users: UserRow[] = (defaultLists ?? []).map((w) => ({
    user_id: w.user_id,
    watchlist_id: w.id,
  }));

  // 2. Por cada usuario, escanea sus primeros N tickers
  for (const u of users) {
    const { data: items } = await admin
      .from('watchlist_items')
      .select('ticker, position')
      .eq('watchlist_id', u.watchlist_id)
      .order('position', { ascending: true })
      .limit(CAP_TICKERS_PER_USER);

    const tickers: ItemRow[] = items ?? [];
    if (tickers.length === 0) continue;

    for (const it of tickers) {
      // Presupuesto ya agotado en un ticker anterior → los restantes se marcan
      // sin tocar DB ni LLM (los retoma el siguiente cron).
      if (budgetExhausted) {
        results.push({ user_id: u.user_id, ticker: it.ticker, outcome: 'skipped_budget' });
        continue;
      }

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

      // R13 · Fin de semana: mercados cerrados para todo lo que no sea crypto.
      if (weekend && !isCryptoTicker(it.ticker)) {
        results.push({ user_id: u.user_id, ticker: it.ticker, outcome: 'skipped_weekend' });
        continue;
      }

      // Skip si ya analizamos esto recientemente
      const recent = await hasRecentAnalysis(u.user_id, it.ticker, SKIP_RECENT_HOURS).catch(() => false);
      if (recent) {
        results.push({ user_id: u.user_id, ticker: it.ticker, outcome: 'skipped_recent' });
        continue;
      }

      // R6 · ¿Cabe una corrida entera antes del corte? Si no, cortamos aquí:
      // mejor N filas completas que N+1 con la última a medias.
      const elapsed = Date.now() - t0;
      if (elapsed + EST_MS_PER_TICKER > TIME_BUDGET_MS) {
        budgetExhausted = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[cron] watchlist-scan budget cut · elapsed=${elapsed}ms · budget=${TIME_BUDGET_MS}ms · ` +
            `est_per_ticker=${EST_MS_PER_TICKER}ms · first_skipped=${it.ticker}`
        );
        results.push({ user_id: u.user_id, ticker: it.ticker, outcome: 'skipped_budget' });
        continue;
      }

      const outcome = await runForUser(u.user_id, it.ticker, { a2TimeoutMs: A2_TIMEOUT_MS });
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

  const count = (o: ScanOutcome) => results.filter((r) => r.outcome === o).length;
  const analyzed = count('analyzed');
  const skippedRecent = count('skipped_recent');
  const skippedWeekend = count('skipped_weekend');
  const skippedBudget = count('skipped_budget');
  const failed = count('failed');
  const totalTokens = results.reduce((acc, r) => acc + (r.tokens_used ?? 0), 0);
  const durationMs = Date.now() - t0;

  // eslint-disable-next-line no-console
  console.log(
    `[cron] watchlist-scan done · analyzed=${analyzed} · skipped_recent=${skippedRecent} · ` +
      `skipped_weekend=${skippedWeekend} · skipped_budget=${skippedBudget} · failed=${failed} · ` +
      `tokens=${totalTokens} · ${durationMs}ms`
  );

  return NextResponse.json({
    users_scanned: users.length,
    analyzed,
    skipped_recent: skippedRecent,
    skipped_weekend: skippedWeekend,
    skipped_budget: skippedBudget,
    failed,
    weekend_mode: weekend,
    budget_cut: budgetExhausted,
    total_tokens: totalTokens,
    duration_ms: durationMs,
    results,
  });
}
