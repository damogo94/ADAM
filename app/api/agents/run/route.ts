/**
 * /api/agents/run — Pipeline integrado A.D.A.M.
 *
 * Refactor Fase 1 · Tarea 1.5
 *
 * Endpoint NUEVO que orquesta el pipeline `runADAM()`:
 *   data fetch → computeTechnical → A1+A2+A3 paralelo → debate opcional →
 *   computeConfluence → A4 narrate.
 *
 * El endpoint LEGACY `/api/agents/a4` queda intacto y operativo. El
 * frontend puede migrar cuando esté validado. Mismas garantías:
 *   - Auth requerida
 *   - CSRF (same-origin)
 *   - Rate-limit per IP (5/min + 30/día) y per-user.id (30/día)
 *   - Top-level try/catch → siempre JSON, nunca HTML
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  fallbackQuote,
  fallbackDaily,
  fallbackIntraday,
  fallbackOverview,
  fallbackNewsSentiment,
} from '@/lib/market/finnhub';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { limiters } from '@/lib/ratelimit';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import { runADAM, AllAgentsFailedError } from '@/agents/pipeline';
import type { MarketSnapshot } from '@/agents/shared/types';
import type { AgentUsage } from '@/lib/anthropic';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z
  .object({
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/]+$/i, 'ticker invalido').toUpperCase(),
  })
  .strict();

export async function POST(req: NextRequest) {
  // Top-level try: garantiza JSON siempre, nunca el "An error occurred…"
  // de Vercel cuando una lambda crashea fuera de un try interno.
  try {
    // CSRF
    const csrf = checkSameOrigin(req);
    if (csrf) return csrf;

    // IP rate-limit (5/min + 30/día)
    const ipLimit = await rateLimitByIP(req, 'analysis');
    if (ipLimit) return ipLimit;

    // Auth
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Per-user daily quota
    const userLimit = await limiters.userRuns
      .limit(user.id)
      .catch(() => ({ success: true, remaining: 99, limit: 30, reset: 0 }));
    if (!userLimit.success) {
      const resetDate = userLimit.reset ? new Date(userLimit.reset).toISOString() : 'mañana';
      return NextResponse.json(
        {
          error: 'user_quota_exceeded',
          detail: `Has alcanzado el límite diario de ${userLimit.limit} análisis. Se renueva el ${resetDate}.`,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(userLimit.limit),
            'X-RateLimit-Remaining': String(userLimit.remaining),
          },
        }
      );
    }

    // Body validation
    const body = await req.json().catch(() => null);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { ticker } = parsed.data;

    try {
      // ─── Data fetch ─────────────────────────────────────────────
      const [q, daily, intraday, ov, news] = await Promise.all([
        fallbackQuote(ticker).catch(() => null),
        fallbackDaily(ticker).catch(() => []),
        fallbackIntraday(ticker).catch(() => []),
        fallbackOverview(ticker).catch(() => null),
        fallbackNewsSentiment(ticker, 5).catch(() => []),
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
        return NextResponse.json(
          {
            error: 'market_data_unavailable',
            detail: `Sin datos de mercado para ${ticker}. Comprueba la grafía (cripto: BTC-USD; forex: EUR/USD; equities: AAPL, IBE.MC).`,
          },
          { status: 503 }
        );
      }

      // Construye MarketSnapshot unificado para el pipeline
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
          fcf_yield_pct: null, // Finnhub free no expone FCF yield
          dividend_yield_pct: ov?.dividend_yield_pct ?? null,
          market_cap_usd: ov?.market_cap_usd ?? null,
        },
        news,
        ohlcv_daily: daily.slice(-100),
        ohlcv_intraday: intraday.slice(-100),
        macro_snapshot: {},
      };

      // ─── Ejecuta pipeline ──────────────────────────────────────
      const usages: AgentUsage[] = [];
      const result = await runADAM(ticker, snapshot, {
        onUsage: (u) => usages.push(u),
      });

      const tokensUsed = usages.reduce(
        (acc, u) => acc + u.input_tokens + u.output_tokens,
        0
      );

      // ─── Persistir log (best-effort) ───────────────────────────
      try {
        const admin = createSupabaseAdmin();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await admin.from('analyses_log').insert({
          user_id: user.id,
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
        } as any);
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error(
          '[run] persist failed:',
          logErr instanceof Error ? logErr.message : logErr
        );
      }

      return NextResponse.json({
        a1: result.intermediates.a1,
        a2: result.intermediates.a2,
        a3: result.intermediates.a3,
        debate: result.intermediates.debate,
        a4: result.output,
        meta: result.meta,
        partial: result.meta.failures.length > 0,
        failures: result.meta.failures.length > 0 ? result.meta.failures : undefined,
        chart_data: snapshot.ohlcv_daily.length >= 5
          ? { daily: snapshot.ohlcv_daily.slice(-60) }
          : undefined,
      });
    } catch (err) {
      if (err instanceof AllAgentsFailedError) {
        return NextResponse.json(
          {
            error: 'all_agents_failed',
            detail: err.message,
            failures: err.failures,
          },
          { status: 503 }
        );
      }
      const msg = err instanceof Error ? err.message : 'unknown';
      Sentry.captureException(err, {
        tags: { endpoint: 'api/agents/run', ticker },
        extra: { user_id: user.id },
      });
      return NextResponse.json(
        { error: 'pipeline_failed', detail: msg },
        { status: 500 }
      );
    }
  } catch (outerErr) {
    // Defense-in-depth: si CUALQUIER cosa rompe arriba del try interno
    // (limiters, supabase, JSON.parse del body raro), devolvemos JSON.
    const msg = outerErr instanceof Error ? outerErr.message : 'unknown';
    // eslint-disable-next-line no-console
    console.error('[run] top-level uncaught:', msg);
    Sentry.captureException(outerErr, {
      tags: { endpoint: 'api/agents/run', level: 'top-level' },
    });
    return NextResponse.json(
      { error: 'internal_error', detail: 'Error interno. Reintenta en unos segundos.' },
      { status: 500 }
    );
  }
}
