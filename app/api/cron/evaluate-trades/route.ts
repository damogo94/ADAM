/**
 * /api/cron/evaluate-trades — Backtest PATH-DEPENDENT de la operativa de A3
 *
 * Hermano de /api/cron/evaluate-signals. Aquél mide la DIRECCIÓN de la señal
 * (¿subió/bajó a 7d/30d?). Éste mide el TRADE real: dentro de la ventana del
 * horizonte, ¿qué se toca primero — stop o target? (ADR-002 fase 3).
 *
 * Disparado por Vercel Cron 1x/día. Por cada analyses_log con operativa
 * accionable (signal buy|sell, entrada/stop/target presentes, horizonte
 * swing|posicional) y SIN fila en trade_outcomes:
 *   1. fetcha velas diarias (Yahoo, 1y) y las acota a (análisis, ventana].
 *   2. corre evaluateTrade() — función pura, determinista.
 *   3. si resuelve (win|loss|timeout|no_fill) → persiste en trade_outcomes.
 *      si sigue 'pending' (sin barrera y ventana no vencida) → reintenta mañana.
 *
 * intradía se evalúa con velas 4H en fase 4; aquí se salta.
 *
 * Seguridad: CRON_SECRET (Bearer). service_role bypassa RLS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { fallbackDaily } from '@/lib/market/finnhub';
import { evaluateTrade, type TradePlan, type EvalCandle } from '@/lib/backtest/trade-eval';
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

/** Plan accionable extraído de a3_output.operativa (todo no-nulo garantizado). */
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
 * Extrae el plan operativo de un a3_output (Json). Devuelve null si el análisis
 * NO es un trade evaluable en esta fase: hold, niveles nulos, o horizonte
 * intradía (→ fase 4 con velas 4H). Defensivo ante runs antiguos sin entry_type.
 */
function extractPlan(a3: unknown): ActionablePlan | null {
  if (!a3 || typeof a3 !== 'object') return null;
  const op = (a3 as { operativa?: unknown }).operativa;
  if (!op || typeof op !== 'object') return null;
  const o = op as Record<string, unknown>;

  if (o.signal !== 'buy' && o.signal !== 'sell') return null;
  if (o.horizonte !== 'swing' && o.horizonte !== 'posicional') return null;
  if (typeof o.entrada !== 'number' || typeof o.stop_loss !== 'number' || typeof o.target !== 'number') {
    return null;
  }

  return {
    direction: o.signal,
    entry_type: o.entry_type === 'limit' ? 'limit' : 'market',
    entrada: o.entrada,
    stop_loss: o.stop_loss,
    target: o.target,
    rb_ratio: typeof o.ratio_riesgo_beneficio === 'number' ? o.ratio_riesgo_beneficio : null,
    horizonte: o.horizonte,
  };
}

interface CandidateRow {
  id: string;
  ticker: string;
  initial_price_at: string | null;
  a3_output: unknown;
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
  const resolved: { analysis_id: string; outcome: string; horizonte: string }[] = [];
  const skipped: { analysis_id: string; reason: string }[] = [];
  let pendingCount = 0;

  // Candidatos: analyses con timestamp de inicio. Orden ascendente → atacamos
  // primero los más antiguos (los más cerca de resolver). Los ya resueltos se
  // descartan abajo cruzando con trade_outcomes.
  const { data: candidates, error: candErr } = await admin
    .from('analyses_log')
    .select('id, ticker, initial_price_at, a3_output')
    .not('initial_price_at', 'is', null)
    .order('initial_price_at', { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (candErr) {
    // eslint-disable-next-line no-console
    console.error('[cron] evaluate-trades candidates query failed:', candErr.message);
    return NextResponse.json({ error: 'candidates_query_failed' }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ resolved_count: 0, pending_count: 0, skipped_count: 0, resolved, skipped });
  }

  const { data: existing, error: existErr } = await admin
    .from('trade_outcomes')
    .select('analysis_id')
    .in(
      'analysis_id',
      candidates.map((c: CandidateRow) => c.id)
    );

  if (existErr) {
    // eslint-disable-next-line no-console
    console.error('[cron] evaluate-trades existing query failed:', existErr.message);
    return NextResponse.json({ error: 'existing_query_failed' }, { status: 500 });
  }
  const done = new Set<string>((existing ?? []).map((e: { analysis_id: string }) => e.analysis_id));

  // Varios análisis pueden compartir ticker → cacheamos las velas por ticker.
  const candleCache = new Map<string, EvalCandle[]>();

  for (const c of candidates as CandidateRow[]) {
    if (done.has(c.id)) continue;
    if (!c.initial_price_at) continue;
    const plan = extractPlan(c.a3_output);
    if (!plan) continue; // hold / intradía / niveles nulos → no es un trade

    const startMs = new Date(c.initial_price_at).getTime();
    const windowEndMs = startMs + HORIZON_WINDOW_DAYS[plan.horizonte] * DAY_MS;
    const windowElapsed = now >= windowEndMs;

    try {
      let candles = candleCache.get(c.ticker);
      if (!candles) {
        const daily = await fallbackDaily(c.ticker, DAILY_RANGE);
        candles = daily.map((d) => ({ t: d.t, o: d.o, h: d.h, l: d.l, c: d.c }));
        candleCache.set(c.ticker, candles);
      }

      // Velas estrictamente POSTERIORES al análisis (forward-looking, sin
      // look-ahead del propio día) y acotadas a min(hoy, fin de ventana).
      const upperMs = Math.min(now, windowEndMs);
      const win = candles.filter((k) => k.t * 1000 >= startMs && k.t * 1000 <= upperMs);
      if (win.length === 0) {
        skipped.push({ analysis_id: c.id, reason: 'no_candles_in_window' });
        continue;
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
        continue;
      }

      const resolvedCandle = res.resolved_index != null ? win[res.resolved_index] : undefined;
      const resolvedDays = resolvedCandle
        ? Math.max(0, Math.round((resolvedCandle.t * 1000 - startMs) / DAY_MS))
        : null;

      const { error: insErr } = await admin.from('trade_outcomes').insert({
        analysis_id: c.id,
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
        // 23505 = race con otra ejecución que ya insertó → ignora.
        if (insErr.code !== '23505') {
          // eslint-disable-next-line no-console
          console.error('[cron] evaluate-trades insert failed:', insErr.message);
          Sentry.captureMessage('cron evaluate-trades insert failed', {
            extra: { analysis_id: c.id, error: insErr.message },
          });
        }
        continue;
      }
      resolved.push({ analysis_id: c.id, outcome: res.outcome!, horizonte: plan.horizonte });
    } catch (err) {
      skipped.push({
        analysis_id: c.id,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
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
