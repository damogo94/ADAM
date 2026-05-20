/**
 * pipeline-runner — helper reutilizable que envuelve runADAM con data fetch
 * y persistencia.
 *
 * Pensado para el cron de watchlist-scan (PR D1), que necesita ejecutar el
 * mismo flujo que `/api/agents/run` pero SIN concerns HTTP (CSRF, rate-limit,
 * auth user context). El cron corre con admin client y user_id explícito.
 *
 * NO se invoca desde `/api/agents/run` todavía — refactor de ese endpoint
 * queda fuera de scope para minimizar riesgo de deploy. Si en el futuro se
 * quiere consolidar, este es el sitio.
 */

import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  fallbackQuote,
  fallbackDaily,
  fallbackIntraday,
  fallbackOverview,
  fallbackNewsSentiment,
} from '@/lib/market/finnhub';
import { getMacroSnapshot } from '@/lib/market/macro';
import { runADAM, AllAgentsFailedError } from '@/agents/pipeline';
import type { MarketSnapshot } from '@/agents/shared/types';
import type { AgentUsage } from '@/lib/anthropic';
import type { RunADAMResult } from '@/agents/pipeline';

export interface RunForUserResult {
  ok: true;
  analysis_id: string | null; // null si el insert falló (best-effort)
  result: RunADAMResult;
  tokens_used: number;
}

export interface RunForUserFailure {
  ok: false;
  error: 'market_data_unavailable' | 'all_agents_failed' | 'pipeline_failed';
  detail: string;
}

export type RunForUserOutcome = RunForUserResult | RunForUserFailure;

/**
 * Ejecuta el pipeline ADAM completo para un usuario+ticker y persiste el
 * resultado en analyses_log. Best-effort en el insert (no tira si falla).
 *
 * Caller responsibility: rate-limiting/quota. Esta función NO los aplica.
 */
export async function runForUser(
  userId: string,
  ticker: string
): Promise<RunForUserOutcome> {
  try {
    // ── Data fetch ─────────────────────────────────────────────
    const [q, daily, intraday, ov, news, macro] = await Promise.all([
      fallbackQuote(ticker).catch(() => null),
      fallbackDaily(ticker).catch(() => []),
      fallbackIntraday(ticker).catch(() => []),
      fallbackOverview(ticker).catch(() => null),
      fallbackNewsSentiment(ticker, 5).catch(() => []),
      getMacroSnapshot().catch(() => null),
    ]);

    // Recovery: precio desde última vela si quote falla
    let currentPrice = q?.current ?? null;
    let changePct24h = q?.change_pct_24h ?? 0;
    if (currentPrice === null && daily.length >= 2) {
      const last = daily[daily.length - 1];
      const prev = daily[daily.length - 2];
      if (last && prev) {
        currentPrice = last.c;
        changePct24h = ((last.c - prev.c) / prev.c) * 100;
      }
    }

    if (currentPrice === null && daily.length === 0) {
      return {
        ok: false,
        error: 'market_data_unavailable',
        detail: `Sin datos de mercado para ${ticker}`,
      };
    }

    const snapshot: MarketSnapshot = {
      ticker,
      quote: {
        current: currentPrice ?? 0,
        change_pct_24h: changePct24h,
        change_pct_7d: 0,
        currency: ov?.currency ?? (q && 'currency' in q ? q.currency : 'USD') ?? 'USD',
      },
      fundamentals: {
        per: ov?.per ?? null,
        peg: ov?.peg ?? null,
        ev_ebitda: ov?.ev_ebitda ?? null,
        fcf_yield_pct: null,
        dividend_yield_pct: ov?.dividend_yield_pct ?? null,
        market_cap_usd: ov?.market_cap_usd ?? null,
      },
      news,
      ohlcv_daily: daily.slice(-100),
      ohlcv_intraday: intraday.slice(-100),
      macro_snapshot: macro ? { ...macro } : {},
    };

    // ── Pipeline ───────────────────────────────────────────────
    const usages: AgentUsage[] = [];
    const result = await runADAM(ticker, snapshot, {
      onUsage: (u) => usages.push(u),
    });

    const tokensUsed = usages.reduce(
      (acc, u) => acc + u.input_tokens + u.output_tokens,
      0
    );

    // ── Persistir log (best-effort) ────────────────────────────
    let analysisId: string | null = null;
    try {
      const admin = createSupabaseAdmin();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted } = await (admin.from('analyses_log') as any)
        .insert({
          user_id: userId,
          ticker,
          confluence_pct: result.output.confluence.score_total_pct,
          direction: result.output.direccion,
          confidence: result.output.confianza,
          a1_output: result.intermediates.a1,
          a2_output: result.intermediates.a2,
          a3_output: result.intermediates.a3,
          debate_output: result.intermediates.debate,
          a4_output: result.output,
          latency_ms: result.meta.durationMs,
          tokens_used: tokensUsed,
          usage_breakdown: usages,
          initial_price: currentPrice,
          initial_price_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      analysisId = inserted?.id ?? null;
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error(
        '[pipeline-runner] persist failed:',
        logErr instanceof Error ? logErr.message : logErr
      );
    }

    return { ok: true, analysis_id: analysisId, result, tokens_used: tokensUsed };
  } catch (err) {
    if (err instanceof AllAgentsFailedError) {
      return { ok: false, error: 'all_agents_failed', detail: err.message };
    }
    return {
      ok: false,
      error: 'pipeline_failed',
      detail: err instanceof Error ? err.message : 'unknown',
    };
  }
}

/**
 * Comprueba si un (user, ticker) tiene un análisis reciente. Usado por el
 * cron para no duplicar work si el usuario ya lanzó el análisis manualmente.
 */
export async function hasRecentAnalysis(
  userId: string,
  ticker: string,
  withinHours: number
): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const cutoffISO = new Date(Date.now() - withinHours * 3_600_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin
    .from('analyses_log')
    .select('id')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .gte('created_at', cutoffISO)
    .limit(1) as any);
  return !!(data && data.length > 0);
}
