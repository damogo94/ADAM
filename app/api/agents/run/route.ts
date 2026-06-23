/**
 * /api/agents/run — Pipeline integrado A.D.A.M.
 *
 * Refactor Fase 1 · Tarea 1.5
 *
 * Endpoint que orquesta el pipeline `runADAM()` y que consume el frontend
 * (/analysis):
 *   data fetch → computeTechnical → A1+A2+A3 paralelo → debate opcional →
 *   computeConfluence → A4 narrate.
 *
 * Garantías:
 *   - Auth requerida
 *   - CSRF (same-origin)
 *   - Rate-limit per IP (5/min + 30/día) y per-user.id (30/día)
 *   - Top-level try/catch → siempre JSON, nunca HTML
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { buildMarketSnapshot } from '@/lib/market/snapshot';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { limiters } from '@/lib/ratelimit';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import { runADAM, AllAgentsFailedError } from '@/agents/pipeline';
import type { AgentUsage } from '@/lib/anthropic';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z
  .object({
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/=^]+$/i, 'ticker invalido').toUpperCase(),
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
      // ─── Data fetch + snapshot ──────────────────────────────────
      // Fan-out + recovery + ensamblado viven en lib/market/snapshot,
      // compartidos con el cron (pipeline-runner) para no divergir.
      const built = await buildMarketSnapshot(ticker);
      if (!built.ok) {
        return NextResponse.json(
          {
            error: 'market_data_unavailable',
            detail: `Sin datos de mercado para ${ticker}. Comprueba la grafía (cripto: BTC-USD; forex: EUR/USD; equities: AAPL, IBE.MC).`,
          },
          { status: 503 }
        );
      }
      const { snapshot, currentPrice } = built.data;

      // ─── Ejecuta pipeline en STREAMING (NDJSON) ────────────────
      // El éxito ya no es un único JSON: emitimos un evento por agente a medida
      // que aterriza (vía onEvent) + un evento `final` con A4/persistencia, para
      // que la UI flipee cada card en su evento real. Los errores INTERNOS del
      // pipeline (all_agents_failed / pipeline_failed) viajan como evento `fatal`
      // dentro del stream — ya hemos comprometido el 200, no podemos volver a un
      // status 5xx. Los gates previos (auth/CSRF/quota/body/market) siguen siendo
      // JSON con su status. skipA2Narrate=true: A2 solo desde cache (su lambda
      // paralelo la calienta). Evita saturar este lambda Hobby de 60s.
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (obj: unknown) =>
            controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
          const usages: AgentUsage[] = [];
          try {
            const result = await runADAM(ticker, snapshot, {
              onUsage: (u) => usages.push(u),
              skipA2Narrate: true,
              onEvent: send,
            });

            const tokensUsed = usages.reduce(
              (acc, u) => acc + u.input_tokens + u.output_tokens,
              0
            );

            // Captura individual de agent failures a Sentry (nivel warning: el
            // pipeline degrada graciosamente). Sin esto un timeout crónico de A2
            // era invisible en diagnóstico.
            for (const f of result.meta.failures) {
              Sentry.captureMessage(`pipeline agent failed: ${f.agent}`, {
                level: 'warning',
                tags: { agent: f.agent, ticker, traceId: result.meta.traceId },
                extra: {
                  message: f.message,
                  durationMs: result.meta.durationMs,
                  debateRan: result.meta.debateRan,
                },
              });
            }

            // ─── Persistir log (best-effort) ───────────────────────
            // Devolvemos el id en `final`: en el primer análisis A2 llega null
            // (cache fría) y la fila se hornea degradada; el frontend re-narra A4
            // vía /api/agents/a4 con este id para cuadrar confluence_pct/etc.
            let analysisId: string | null = null;
            try {
              const admin = createSupabaseAdmin();
              const { data: inserted } = await admin
                .from('analyses_log')
                .insert({
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
                '[run] persist failed:',
                logErr instanceof Error ? logErr.message : logErr
              );
            }

            send({
              type: 'final',
              analysis_id: analysisId,
              a4: result.output,
              meta: result.meta,
              partial: result.meta.failures.length > 0,
              failures: result.meta.failures.length > 0 ? result.meta.failures : undefined,
              chart_data:
                snapshot.ohlcv_daily.length >= 5
                  ? { daily: snapshot.ohlcv_daily.slice(-60) }
                  : undefined,
            });
          } catch (pipeErr) {
            if (pipeErr instanceof AllAgentsFailedError) {
              send({
                type: 'fatal',
                error: 'all_agents_failed',
                detail: pipeErr.message,
                failures: pipeErr.failures,
              });
            } else {
              const msg = pipeErr instanceof Error ? pipeErr.message : 'unknown';
              Sentry.captureException(pipeErr, {
                tags: { endpoint: 'api/agents/run', ticker },
                extra: { user_id: user.id },
              });
              send({ type: 'fatal', error: 'pipeline_failed', detail: msg });
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          // Evita el buffering de proxies (nginx/Vercel) para que el stream fluya.
          'X-Accel-Buffering': 'no',
        },
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
