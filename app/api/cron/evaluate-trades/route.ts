/**
 * /api/cron/evaluate-trades — Backtest PATH-DEPENDENT de las operativas
 *
 * Hermano de /api/cron/evaluate-signals. Aquél mide la DIRECCIÓN de la señal
 * (¿subió/bajó a 7d/30d?). Éste mide el TRADE real: dentro de la ventana del
 * horizonte, ¿qué se toca primero — stop o target? (ADR-002 fase 3).
 *
 * Mide DOS fuentes por análisis (una fila por fuente en trade_outcomes):
 *   - source='a3'         → operativa de A3 (`a3_output.operativa`), trade PRIMARIO.
 *   - source='estructura' → plan del agente de Estructura (`estructura_output`),
 *                           trade PARALELO (F7). Cada fuente se evalúa e inserta
 *                           de forma INDEPENDIENTE: un análisis puede tener la fila
 *                           A3 pero no la de Estructura (y viceversa).
 *
 * Disparado por Vercel Cron 1x/día. Por cada análisis accionable por A3 o por
 * Estructura y SIN la fila (analysis_id, source) correspondiente:
 *   1. fetcha velas diarias (Yahoo, 1y) y las acota a (análisis, ventana].
 *   2. corre evaluateTrade() — función pura, determinista.
 *   3. si resuelve (win|loss|timeout|no_fill) → persiste en trade_outcomes.
 *      si sigue 'pending' (sin barrera y ventana no vencida) → reintenta mañana.
 *
 * intradía se evalúa con velas 4H en fase 4; aquí se salta (ambas fuentes).
 *
 * Seguridad: CRON_SECRET (Bearer). service_role bypassa RLS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { fallbackDaily } from '@/lib/market/finnhub';
import { evaluateTrade, type TradePlan, type EvalCandle } from '@/lib/backtest/trade-eval';
import {
  extractTradeSummary,
  extractEstructuraTradeSummary,
  type TradeSource,
} from '@/lib/analyses/trade-summary';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Ventana en días naturales por horizonte. Pasada la ventana sin barrera, el
// trade resuelve en 'timeout' (sale al close) o 'no_fill' (límite no disparó).
const HORIZON_WINDOW_DAYS: Record<'swing' | 'posicional', number> = {
  swing: 30,
  posicional: 120,
};

// Rango Yahoo: cubre la ventana posicional (~120d) con margen holgado.
const DAILY_RANGE = '1y';
const DAY_MS = 86_400_000;
const CANDIDATE_LIMIT = 500;

/** Plan accionable de una fuente (todo no-nulo garantizado). */
interface ActionablePlan {
  direction: 'buy' | 'sell';
  entry_type: 'market' | 'limit';
  entrada: number;
  stop_loss: number;
  target: number;
  rb_ratio: number | null;
  horizonte: 'swing' | 'posicional';
}

/**
 * Convierte un `TradeSummary` (SSOT) al `ActionablePlan` del cron, filtrando a los
 * horizontes evaluables con velas diarias (swing|posicional; intradía → fase 4 con
 * velas 4H). null si no hay trade o el horizonte no es evaluable en esta fase.
 */
function toActionablePlan(summary: ReturnType<typeof extractTradeSummary>): ActionablePlan | null {
  if (!summary) return null;
  if (summary.horizonte !== 'swing' && summary.horizonte !== 'posicional') return null;
  return {
    direction: summary.signal,
    entry_type: summary.entry_type,
    entrada: summary.entrada,
    stop_loss: summary.stop_loss,
    target: summary.target,
    rb_ratio: summary.rb,
    horizonte: summary.horizonte,
  };
}

/**
 * Extrae el plan accionable de A3 desde `a3_output`. Reusa `extractTradeSummary`
 * (SSOT de accionabilidad A3: signal buy/sell + geometría COHERENTE vía
 * `buildSignalTradePlan` — rechaza niveles degenerados/invertidos) y filtra a
 * swing|posicional. Devuelve null para hold, niveles nulos, geometría incoherente
 * o intradía. Espejo exacto de `extractEstructuraPlan` (misma SSOT, distinto agente).
 */
function extractPlan(a3Output: unknown): ActionablePlan | null {
  return toActionablePlan(extractTradeSummary(a3Output));
}

/**
 * Extrae el plan accionable del agente de Estructura desde `estructura_output`.
 * Reusa `extractEstructuraTradeSummary` (SSOT de accionabilidad de Estructura:
 * estado listo|esperando_confirmacion + geometría coherente) y filtra a
 * swing|posicional (intradía → fase 4, igual que A3). `entry_type` viaja ya en el
 * summary (leído de `gestion.entry_type`, fallback 'market').
 */
function extractEstructuraPlan(estructuraOutput: unknown): ActionablePlan | null {
  return toActionablePlan(extractEstructuraTradeSummary(estructuraOutput));
}

interface CandidateRow {
  id: string;
  ticker: string;
  initial_price_at: string | null;
  a3_output: unknown;
  estructura_output: unknown;
}

const CANDIDATE_COLUMNS = 'id, ticker, initial_price_at, a3_output, estructura_output';

/** Clave del done-set: una fila por (analysis_id, source) en trade_outcomes. */
function doneKey(analysisId: string, source: TradeSource): string {
  return `${analysisId}|${source}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const now = Date.now();
  const resolved: { analysis_id: string; source: TradeSource; outcome: string; horizonte: string }[] = [];
  const skipped: { analysis_id: string; source: TradeSource; reason: string }[] = [];
  let pendingCount = 0;

  // Candidatos: análisis accionables por A3 O por Estructura, filtrados en la
  // propia query vía jsonb path. Este filtro es clave para que el cron escale: el
  // ~94% de análisis son 'hold'/sin-setup y, sin él, una vez el total supere
  // CANDIDATE_LIMIT el orden ascendente serviría análisis viejos no-accionables
  // (que nunca generan fila en trade_outcomes y reaparecen siempre) antes que los
  // trades nuevos.
  //
  // DOS queries (una por fuente) fusionadas por id, en vez de un .or() con paths
  // jsonb: PostgREST admite jsonb en .or() pero la sintaxis (embeber `->`/`->>`
  // dentro de la cadena de condiciones, escapando `.`/`,`) es frágil y no hay
  // precedente en el repo. Dos .in()/.eq() encadenados son legibles, testeables y
  // cada uno mantiene el filtro server-side. Fusión por id → un solo candidato con
  // ambas columnas (a3_output + estructura_output), evaluadas independientemente.
  //   - Grupo A3:        operativa.signal in (buy,sell) AND horizonte in (swing,posicional)
  //   - Grupo Estructura: setup.estado in (listo, esperando_confirmacion)
  // Orden ascendente por initial_price_at → atacamos primero los más antiguos.
  // extractPlan()/extractEstructuraPlan() revalidan todo en memoria (defensa en
  // profundidad; el estado accionable no garantiza geometría/horizonte válidos).
  const a3Query = admin
    .from('analyses_log')
    .select(CANDIDATE_COLUMNS)
    .not('initial_price_at', 'is', null)
    .in('a3_output->operativa->>signal', ['buy', 'sell'])
    .in('a3_output->operativa->>horizonte', ['swing', 'posicional'])
    .order('initial_price_at', { ascending: true })
    .limit(CANDIDATE_LIMIT);

  const estructuraQuery = admin
    .from('analyses_log')
    .select(CANDIDATE_COLUMNS)
    .not('initial_price_at', 'is', null)
    .in('estructura_output->setup->>estado', ['listo', 'esperando_confirmacion'])
    .order('initial_price_at', { ascending: true })
    .limit(CANDIDATE_LIMIT);

  const [a3Res, estructuraRes] = await Promise.all([a3Query, estructuraQuery]);

  if (a3Res.error || estructuraRes.error) {
    const msg = a3Res.error?.message ?? estructuraRes.error?.message ?? 'unknown';
    // eslint-disable-next-line no-console
    console.error('[cron] evaluate-trades candidates query failed:', msg);
    return NextResponse.json({ error: 'candidates_query_failed' }, { status: 500 });
  }

  // Fusión por id: un análisis accionable por ambas fuentes aparece en las dos
  // queries → un solo CandidateRow con a3_output + estructura_output.
  const byId = new Map<string, CandidateRow>();
  for (const row of [...(a3Res.data ?? []), ...(estructuraRes.data ?? [])] as CandidateRow[]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const candidates = Array.from(byId.values());

  if (candidates.length === 0) {
    return NextResponse.json({ resolved_count: 0, pending_count: 0, skipped_count: 0, resolved, skipped });
  }

  // Cruce con trade_outcomes por (analysis_id, source): cada fuente se evalúa
  // independientemente, así que la clave del done-set es compuesta.
  const { data: existing, error: existErr } = await admin
    .from('trade_outcomes')
    .select('analysis_id, source')
    .in(
      'analysis_id',
      candidates.map((c) => c.id)
    );

  if (existErr) {
    // eslint-disable-next-line no-console
    console.error('[cron] evaluate-trades existing query failed:', existErr.message);
    return NextResponse.json({ error: 'existing_query_failed' }, { status: 500 });
  }
  const done = new Set<string>(
    (existing ?? []).map((e: { analysis_id: string; source: string }) =>
      doneKey(e.analysis_id, e.source as TradeSource)
    )
  );

  // Varios análisis pueden compartir ticker → cacheamos las velas por ticker.
  // La caché se comparte entre ambas fuentes (no re-fetcheamos por fuente).
  const candleCache = new Map<string, EvalCandle[]>();

  async function candlesFor(ticker: string): Promise<EvalCandle[]> {
    let candles = candleCache.get(ticker);
    if (!candles) {
      const daily = await fallbackDaily(ticker, DAILY_RANGE);
      candles = daily.map((d) => ({ t: d.t, o: d.o, h: d.h, l: d.l, c: d.c }));
      candleCache.set(ticker, candles);
    }
    return candles;
  }

  /**
   * Evalúa un plan de una fuente y, si resuelve, lo inserta en trade_outcomes.
   * Comparte la caché de velas por ticker. Mantiene los invariantes: velas
   * forward-looking (> análisis), acotadas a min(hoy, fin de ventana), pending
   * reintenta mañana, idempotencia 23505.
   */
  async function evaluateSource(c: CandidateRow, source: TradeSource, plan: ActionablePlan): Promise<void> {
    if (done.has(doneKey(c.id, source))) return;
    if (!c.initial_price_at) return;

    const startMs = new Date(c.initial_price_at).getTime();
    const windowEndMs = startMs + HORIZON_WINDOW_DAYS[plan.horizonte] * DAY_MS;
    const windowElapsed = now >= windowEndMs;

    try {
      const candles = await candlesFor(c.ticker);

      // Velas estrictamente POSTERIORES al análisis (forward-looking, sin
      // look-ahead del propio día) y acotadas a min(hoy, fin de ventana).
      const upperMs = Math.min(now, windowEndMs);
      const win = candles.filter((k) => k.t * 1000 >= startMs && k.t * 1000 <= upperMs);
      if (win.length === 0) {
        skipped.push({ analysis_id: c.id, source, reason: 'no_candles_in_window' });
        return;
      }

      const tradePlan: TradePlan = {
        direction: plan.direction,
        entry_type: plan.entry_type,
        entrada: plan.entrada,
        stop_loss: plan.stop_loss,
        target: plan.target,
      };
      const res = evaluateTrade(tradePlan, win, { windowElapsed });

      if (res.status === 'pending') {
        pendingCount++;
        return;
      }

      const resolvedCandle = res.resolved_index != null ? win[res.resolved_index] : undefined;
      const resolvedDays = resolvedCandle
        ? Math.max(0, Math.round((resolvedCandle.t * 1000 - startMs) / DAY_MS))
        : null;

      const { error: insErr } = await admin.from('trade_outcomes').insert({
        analysis_id: c.id,
        source,
        direction: tradePlan.direction,
        entry_type: tradePlan.entry_type,
        horizonte: plan.horizonte,
        outcome: res.outcome!,
        entry: tradePlan.entrada,
        stop_loss: tradePlan.stop_loss,
        target: tradePlan.target,
        rb_ratio: plan.rb_ratio,
        exit_price: res.exit_price,
        return_pct: res.return_pct,
        r_multiple: res.r_multiple,
        resolved_days: resolvedDays,
      });

      if (insErr) {
        // 23505 = race con otra ejecución que ya insertó esta (analysis_id, source) → ignora.
        if (insErr.code !== '23505') {
          // eslint-disable-next-line no-console
          console.error('[cron] evaluate-trades insert failed:', insErr.message);
          Sentry.captureMessage('cron evaluate-trades insert failed', {
            extra: { analysis_id: c.id, source, error: insErr.message },
          });
        }
        return;
      }
      resolved.push({ analysis_id: c.id, source, outcome: res.outcome!, horizonte: plan.horizonte });
    } catch (err) {
      skipped.push({
        analysis_id: c.id,
        source,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  for (const c of candidates) {
    if (!c.initial_price_at) continue;

    // Fuente A3 (primaria). null → hold / intradía / niveles nulos → no es trade.
    const a3Plan = extractPlan(c.a3_output);
    if (a3Plan) await evaluateSource(c, 'a3', a3Plan);

    // Fuente Estructura (paralela). null → no accionable / intradía / geometría inválida.
    const estructuraPlan = extractEstructuraPlan(c.estructura_output);
    if (estructuraPlan) await evaluateSource(c, 'estructura', estructuraPlan);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[cron] evaluate-trades done · resolved=${resolved.length} · pending=${pendingCount} · skipped=${skipped.length}`
  );

  return NextResponse.json({
    resolved_count: resolved.length,
    pending_count: pendingCount,
    skipped_count: skipped.length,
    resolved,
    skipped,
  });
}
