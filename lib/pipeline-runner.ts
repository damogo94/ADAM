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
import { buildMarketSnapshot } from '@/lib/market/snapshot';
import { runADAM, AllAgentsFailedError } from '@/agents/pipeline';
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

export interface RunForUserOptions {
  /**
   * Timeout (ms) para la llamada inline a A2 dentro de runADAM. Se reenvía tal
   * cual como `RunADAMOptions.a2TimeoutMs` — SOLO afecta a narrateA2. El cron
   * watchlist-scan pasa 45_000 (lambda de 300s); sin valor, A2 usa su default.
   */
  a2TimeoutMs?: number;
}

/**
 * Construye la fila de `analyses_log` a partir del resultado de runADAM. SSOT del
 * shape del insert: lo comparten `/api/agents/run` (endpoint) y `runForUser` (cron
 * watchlist-scan) para que NO diverjan — ya pasó: el cron dejó de persistir los
 * ejes Fase 1 (net_pct/kappa/actionable_pct) y sus filas caían fuera de los buckets
 * by_actionable/by_kappa de /api/metrics/calibration. `computeConfluence` siempre
 * emite los ejes (nullable por defensa ante filas viejas). El caller hace el insert.
 */
export function buildAnalysesLogRow(params: {
  userId: string;
  ticker: string;
  result: RunADAMResult;
  usages: AgentUsage[];
  tokensUsed: number;
  currentPrice: number | null;
}) {
  const { userId, ticker, result, usages, tokensUsed, currentPrice } = params;
  return {
    user_id: userId,
    ticker,
    confluence_pct: result.output.confluence.score_total_pct,
    // Fase 1 · ejes separados (nullable; computeConfluence siempre los emite).
    net_pct: result.output.confluence.net_pct ?? null,
    kappa: result.output.confluence.kappa ?? null,
    actionable_pct: result.output.confluence.actionable_pct ?? null,
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
  };
}

/**
 * Ejecuta el pipeline ADAM completo para un usuario+ticker y persiste el
 * resultado en analyses_log. Best-effort en el insert (no tira si falla).
 *
 * Caller responsibility: rate-limiting/quota. Esta función NO los aplica.
 */
export async function runForUser(
  userId: string,
  ticker: string,
  options: RunForUserOptions = {}
): Promise<RunForUserOutcome> {
  try {
    // ── Data fetch + snapshot (compartido con /api/agents/run) ──
    const built = await buildMarketSnapshot(ticker);
    if (!built.ok) {
      return {
        ok: false,
        error: 'market_data_unavailable',
        detail: `Sin datos de mercado para ${ticker}`,
      };
    }
    const { snapshot, currentPrice } = built.data;

    // ── Pipeline ───────────────────────────────────────────────
    const usages: AgentUsage[] = [];
    const result = await runADAM(ticker, snapshot, {
      onUsage: (u) => usages.push(u),
      ...(options.a2TimeoutMs !== undefined ? { a2TimeoutMs: options.a2TimeoutMs } : {}),
    });

    const tokensUsed = usages.reduce(
      (acc, u) => acc + u.input_tokens + u.output_tokens,
      0
    );

    // ── Persistir log (best-effort) ────────────────────────────
    let analysisId: string | null = null;
    try {
      const admin = createSupabaseAdmin();
      const { data: inserted } = await admin
        .from('analyses_log')
        .insert(buildAnalysesLogRow({ userId, ticker, result, usages, tokensUsed, currentPrice }))
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
  const { data } = await admin
    .from('analyses_log')
    .select('id')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .gte('created_at', cutoffISO)
    .limit(1);
  return !!(data && data.length > 0);
}
