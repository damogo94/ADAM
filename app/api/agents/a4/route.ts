import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { runA1 } from '@/agents/a1/client';
import { runA2 } from '@/agents/a2/client';
import { runA3 } from '@/agents/a3/client';
import { runDebate } from '@/agents/debate/client';
import { runA4 } from '@/agents/a4/client';
import {
  quote,
  overview,
  newsSentiment,
  timeSeriesDaily,
  timeSeriesIntraday,
  normalizeQuote,
  normalizeOverview,
  normalizeNews,
  normalizeDaily,
  normalizeIntraday,
} from '@/lib/market/alphavantage';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { limiters } from '@/lib/ratelimit';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import type { AgentUsage } from '@/lib/anthropic';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';
import type { A3Output } from '@/agents/a3/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z
  .object({
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/]+$/i, 'ticker invalido').toUpperCase(),
  })
  .strict();

type AgentFailure = { agent: 'A1' | 'A2' | 'A3'; message: string };

/**
 * Orquestador A4.
 *
 * Flujo:
 *   0. Auth + per-user rate-limit (20/dia)
 *   1. Fetch market data (paralelo, .catch resiliente)
 *   2. Lanza A1/A2/A3 con Promise.allSettled — un fallo NO tira el pipeline.
 *      A3 sólo recibe ticker + OHLCV.
 *   3. Debate solo si A1 Y A2 vivos y al menos uno detecta señal.
 *   4. A4 ensambla con lo que haya. Si los 3 agentes cayeron → 503.
 *   5. Log a analyses_log (best-effort).
 *
 * Coste por llamada (sin cache compartido): 5 calls Alpha Vantage + 3 Sonnet + 1 Opus + opcional 1 Opus debate.
 */
export async function POST(req: NextRequest) {
  // Top-level try: garantiza que CUALQUIER throw devuelve JSON al cliente
  // (no texto plano "An error occurred..." de Vercel). Esto evita el
  // "Unexpected token 'A' is not valid JSON" en el frontend cuando un
  // lambda crashea fuera del try interior de orquestación.
  try {
    // CSRF
    const csrf = checkSameOrigin(req);
    if (csrf) return csrf;

    // IP rate-limit (10/min) — antes vivía en middleware Edge, movido aquí
    // porque Upstash no es Edge-compatible
    const ipLimit = await rateLimitByIP(req, 'analysis');
    if (ipLimit) return ipLimit;

    // Auth
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Per-user rate limit (20/dia) — vector de abuso si user rota IPs
    // El getter `limiters.userRuns` puede throw si Upstash creds fallan;
    // queda atrapado por el try-catch top-level y devuelto como 503 JSON.
    const userLimit = await limiters.userRuns
      .limit(user.id)
      .catch(() => ({ success: true, remaining: 99, limit: 20, reset: 0 }));
    if (!userLimit.success) {
    const resetDate = userLimit.reset ? new Date(userLimit.reset).toISOString() : 'mañana';
    return NextResponse.json(
      {
        error: 'user_quota_exceeded',
        detail: `Has alcanzado el límite diario de ${userLimit.limit} análisis. Se renueva el ${resetDate}.`,
      },
      { status: 429, headers: { 'X-RateLimit-Limit': String(userLimit.limit), 'X-RateLimit-Remaining': String(userLimit.remaining) } }
    );
  }

  // Body validation
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const { ticker } = parsed.data;

  const startedAt = Date.now();
  try {
    // Step 1: market data fan-out — todas resilientes
    const [q, ov, news, daily, intraday] = await Promise.all([
      quote(ticker).then(normalizeQuote).catch(() => null),
      overview(ticker).then(normalizeOverview).catch(() => null),
      newsSentiment(ticker, 5).then((n) => normalizeNews(n, 5)).catch(() => []),
      timeSeriesDaily(ticker).then(normalizeDaily).catch(() => []),
      timeSeriesIntraday(ticker, '60min').then((d) => normalizeIntraday(d, '60min')).catch(() => []),
    ]);

    // Recovery de precio desde daily si quote falla
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

    // Sin precio Y sin candles diarias → no podemos analizar nada
    if (currentPrice === null && daily.length === 0) {
      return NextResponse.json(
        {
          error: 'market_data_unavailable',
          detail:
            `Sin datos de mercado para ${ticker}. Alpha Vantage free-tier puede estar al límite (25/día, 5/min). Espera ~1 minuto y reintenta.`,
        },
        { status: 503 }
      );
    }

    const market_snapshot = {
      quote: {
        current: currentPrice ?? 0,
        change_pct_24h: changePct24h,
        change_pct_7d: 0,
        currency: ov?.currency ?? 'USD',
      },
      fundamentals: {
        per: ov?.per ?? null,
        peg: ov?.peg ?? null,
        ev_ebitda: ov?.ev_ebitda ?? null,
        dividend_yield_pct: ov?.dividend_yield_pct ?? null,
        market_cap_usd: ov?.market_cap_usd ?? null,
      },
      news,
    };

    const ohlcv = [
      { timeframe: '1D', candles: daily.slice(-100) },
      { timeframe: '1H', candles: intraday.slice(-100) },
    ];

    // Step 2: agents con Promise.allSettled — un fallo NO tira el pipeline
    // Tracking de coste: cada agente reporta su usage via callback.
    const usages: AgentUsage[] = [];
    const trackUsage = (u: AgentUsage) => usages.push(u);

    const settled = await Promise.allSettled([
      runA1({ ticker, market_snapshot }, trackUsage),
      runA2({ ticker, macro_snapshot: {} }, trackUsage),
      runA3({ ticker, ohlcv }, trackUsage),
    ]);

    const a1: A1Output | null = settled[0]!.status === 'fulfilled' ? settled[0]!.value : null;
    const a2: A2Output | null = settled[1]!.status === 'fulfilled' ? settled[1]!.value : null;
    const a3: A3Output | null = settled[2]!.status === 'fulfilled' ? settled[2]!.value : null;

    const failures: AgentFailure[] = [];
    if (settled[0]!.status === 'rejected') {
      failures.push({ agent: 'A1', message: settled[0]!.reason instanceof Error ? settled[0]!.reason.message : 'unknown' });
    }
    if (settled[1]!.status === 'rejected') {
      failures.push({ agent: 'A2', message: settled[1]!.reason instanceof Error ? settled[1]!.reason.message : 'unknown' });
    }
    if (settled[2]!.status === 'rejected') {
      failures.push({ agent: 'A3', message: settled[2]!.reason instanceof Error ? settled[2]!.reason.message : 'unknown' });
    }

    // Si los 3 agentes cayeron, no tiene sentido invocar A4
    if (!a1 && !a2 && !a3) {
      return NextResponse.json(
        {
          error: 'all_agents_failed',
          detail: 'Los 3 agentes fallaron transitoriamente. Reintenta en unos segundos.',
          failures,
        },
        { status: 503 }
      );
    }

    // Step 3: debate solo si A1 Y A2 vivos y al menos uno detecta señal
    let debate = null;
    if (a1 && a2 && (a1.anomaly_detected || a2.opportunity_detected)) {
      debate = await runDebate({ a1, a2 }, trackUsage).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[a4] debate failed, continuing without it:', err instanceof Error ? err.message : err);
        return null;
      });
    }

    // Step 4: A4 ensambla con lo que haya
    const a4 = await runA4({ ticker, a1, a2, a3, debate, failures }, trackUsage);
    const latency_ms = Date.now() - startedAt;
    const tokens_used = usages.reduce((acc, u) => acc + u.input_tokens + u.output_tokens, 0);

    // Step 5: persistir log (best-effort)
    try {
      const admin = createSupabaseAdmin();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await admin.from('analyses_log').insert({
        user_id: user.id,
        ticker,
        confluence_pct: a4.confluence?.score_total_pct ?? 0,
        direction: a4.direccion,
        confidence: a4.confianza,
        a1_output: a1,
        a2_output: a2,
        a3_output: a3,
        debate_output: debate ?? null,
        a4_output: a4,
        latency_ms,
        tokens_used,
      } as any);
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[a4] failed to persist analyses_log:', logErr instanceof Error ? logErr.message : logErr);
    }

    return NextResponse.json({
      a1,
      a2,
      a3,
      debate,
      a4,
      partial: failures.length > 0,
      failures: failures.length > 0 ? failures : undefined,
      // Candles diarias para el mini-chart en A3 card (últimos 60 días)
      chart_data: daily.length >= 5 ? { daily: daily.slice(-60) } : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    const payload: Record<string, unknown> = { error: 'orchestration_failed', detail: msg };
    if (err && typeof err === 'object' && 'zodIssues' in err) {
      payload.zodIssues = (err as { zodIssues: unknown }).zodIssues;
      payload.agent = (err as { agent?: string }).agent;
    }
    // No log en Sentry de errores conocidos (rate-limit, AV soft, etc) — ya filtrados
    // en beforeSend. Sí capturamos el resto con contexto del análisis.
    Sentry.captureException(err, {
      tags: {
        endpoint: 'api/agents/a4',
        ticker,
        failing_agent: (payload.agent as string) ?? 'orchestrator',
      },
      extra: { user_id: user.id },
    });
      return NextResponse.json(payload, { status: 500 });
    }
  } catch (outerErr) {
    // Defense-in-depth: cualquier throw NO atrapado arriba (ej. limiters.userRuns
    // getter, createSupabaseServer crash, JSON.parse del body con corruption raro)
    // termina aquí. Sin esto, Vercel devuelve texto plano "An error occurred..."
    // que el frontend no puede parsear como JSON.
    const msg = outerErr instanceof Error ? outerErr.message : 'unknown';
    // eslint-disable-next-line no-console
    console.error('[a4] top-level uncaught:', msg);
    Sentry.captureException(outerErr, { tags: { endpoint: 'api/agents/a4', level: 'top-level' } });
    return NextResponse.json(
      { error: 'internal_error', detail: 'Error interno del servidor. Reintenta en unos segundos.' },
      { status: 500 }
    );
  }
}
