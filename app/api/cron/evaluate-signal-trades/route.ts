/**
 * /api/cron/evaluate-signal-trades — Backtest PATH-DEPENDENT de las señales CMT
 *
 * Hermano de /api/cron/evaluate-trades (que mide la operativa de A3 colgando de
 * analyses_log). Éste mide el trade real de las SEÑALES CMT (signals_history),
 * que hoy no se evaluaban: dentro de la ventana, ¿qué se toca primero — stop o
 * target? → win/loss/timeout. Persiste en signal_trade_outcomes.
 *
 * Disparado por Vercel Cron 1x/día (tras evaluate-trades). Por cada señal con
 * niveles completos (entry/stop/target NOT NULL), timeframe '1D' y SIN fila en
 * signal_trade_outcomes:
 *   1. infiere la dirección de la geometría (lib/backtest/signal-plan); degenerada
 *      → not_evaluable (terminal, no se reintenta).
 *   2. fetcha velas diarias (Yahoo, 1y) y las acota a (emitted_at, ventana].
 *   3. corre evaluateTrade() — función pura (lib/backtest/trade-eval, reutilizada).
 *   4. si resuelve → persiste; si sigue 'pending' → reintenta mañana.
 *
 * Las señales '1H' (intradía) se SALTAN: con velas diarias no se puede resolver
 * el orden TP/SL intradía y la ventana de 30d sería errónea. El scanner CMT
 * determinista (buildCMTSignal) ya solo emite '1D' — el intraday alimenta el MTF,
 * no genera señales 1H — así que el filtro queda como back-compat defensivo.
 *
 * entry_type siempre 'market': CMT no expone tipo de entrada → asumimos entrada
 * al entry_price en la emisión.
 *
 * Seguridad: CRON_SECRET (Bearer). service_role bypassa RLS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { fallbackDaily } from '@/lib/market/finnhub';
import { evaluateTrade, type EvalCandle } from '@/lib/backtest/trade-eval';
import { buildSignalTradePlan } from '@/lib/backtest/signal-plan';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Ventana 1D = 30 días naturales (= horizonte swing). Pasada sin barrera → timeout.
const WINDOW_DAYS = 30;
const DAILY_RANGE = '1y';
const DAY_MS = 86_400_000;
const CANDIDATE_LIMIT = 500;

interface CandidateRow {
  id: string;
  ticker: string;
  emitted_at: string;
  entry_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
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
  const resolved: { signal_id: string; outcome: string }[] = [];
  const skipped: { signal_id: string; reason: string }[] = [];
  let pendingCount = 0;

  // Candidatos: señales 1D con niveles completos. Las 1H se saltan en la query
  // (intradía, fuera de fase). Orden ascendente → atacamos primero las más
  // antiguas (las más cerca de resolver) → backfill histórico en la 1ª pasada.
  // Las ya resueltas se descartan abajo cruzando con signal_trade_outcomes.
  const { data: candidates, error: candErr } = await admin
    .from('signals_history')
    .select('id, ticker, emitted_at, entry_price, stop_loss, target_price')
    .eq('timeframe', '1D')
    .not('entry_price', 'is', null)
    .not('stop_loss', 'is', null)
    .not('target_price', 'is', null)
    .order('emitted_at', { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (candErr) {
    // eslint-disable-next-line no-console
    console.error('[cron] evaluate-signal-trades candidates query failed:', candErr.message);
    return NextResponse.json({ error: 'candidates_query_failed' }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ resolved_count: 0, pending_count: 0, skipped_count: 0, resolved, skipped });
  }

  const { data: existing, error: existErr } = await admin
    .from('signal_trade_outcomes')
    .select('signal_id')
    .in(
      'signal_id',
      candidates.map((c: CandidateRow) => c.id)
    );

  if (existErr) {
    // eslint-disable-next-line no-console
    console.error('[cron] evaluate-signal-trades existing query failed:', existErr.message);
    return NextResponse.json({ error: 'existing_query_failed' }, { status: 500 });
  }
  const done = new Set<string>((existing ?? []).map((e: { signal_id: string }) => e.signal_id));

  // Varias señales pueden compartir ticker → cacheamos las velas por ticker.
  const candleCache = new Map<string, EvalCandle[]>();

  for (const c of candidates as CandidateRow[]) {
    if (done.has(c.id)) continue;
    if (c.entry_price === null || c.stop_loss === null || c.target_price === null) continue;

    const startMs = new Date(c.emitted_at).getTime();
    const windowEndMs = startMs + WINDOW_DAYS * DAY_MS;
    const windowElapsed = now >= windowEndMs;

    // Dirección inferida de la geometría. Degenerada → not_evaluable terminal.
    const plan = buildSignalTradePlan(c.entry_price, c.stop_loss, c.target_price);
    if (!plan) {
      await persist(admin, c, {
        direction: null,
        entry_type: null,
        outcome: 'not_evaluable',
        exit_price: null,
        return_pct: null,
        r_multiple: null,
        resolved_days: null,
      });
      resolved.push({ signal_id: c.id, outcome: 'not_evaluable' });
      continue;
    }

    try {
      let candles = candleCache.get(c.ticker);
      if (!candles) {
        const daily = await fallbackDaily(c.ticker, DAILY_RANGE);
        candles = daily.map((d) => ({ t: d.t, o: d.o, h: d.h, l: d.l, c: d.c }));
        candleCache.set(c.ticker, candles);
      }

      // Velas POSTERIORES a la emisión (forward-looking) y acotadas a
      // min(hoy, fin de ventana).
      const upperMs = Math.min(now, windowEndMs);
      const win = candles.filter((k) => k.t * 1000 >= startMs && k.t * 1000 <= upperMs);
      if (win.length === 0) {
        // Ventana vencida sin velas (señal anterior al rango Yahoo disponible) →
        // nunca se podrá evaluar → not_evaluable terminal (evita reprocesado).
        // Si la ventana aún no venció, reintenta mañana.
        if (windowElapsed) {
          await persist(admin, c, {
            direction: plan.direction,
            entry_type: plan.entry_type,
            outcome: 'not_evaluable',
            exit_price: null,
            return_pct: null,
            r_multiple: null,
            resolved_days: null,
          });
          resolved.push({ signal_id: c.id, outcome: 'not_evaluable' });
        } else {
          skipped.push({ signal_id: c.id, reason: 'no_candles_in_window' });
        }
        continue;
      }

      const res = evaluateTrade(plan, win, { windowElapsed });
      if (res.status === 'pending') {
        pendingCount++;
        continue;
      }

      const resolvedCandle = res.resolved_index != null ? win[res.resolved_index] : undefined;
      const resolvedDays = resolvedCandle
        ? Math.max(0, Math.round((resolvedCandle.t * 1000 - startMs) / DAY_MS))
        : null;

      const insErr = await persist(admin, c, {
        direction: plan.direction,
        entry_type: plan.entry_type,
        outcome: res.outcome!,
        exit_price: res.exit_price,
        return_pct: res.return_pct,
        r_multiple: res.r_multiple,
        resolved_days: resolvedDays,
      });
      if (insErr) {
        if (insErr.code !== '23505') {
          // eslint-disable-next-line no-console
          console.error('[cron] evaluate-signal-trades insert failed:', insErr.message);
          Sentry.captureMessage('cron evaluate-signal-trades insert failed', {
            extra: { signal_id: c.id, error: insErr.message },
          });
        }
        continue;
      }
      resolved.push({ signal_id: c.id, outcome: res.outcome! });
    } catch (err) {
      skipped.push({ signal_id: c.id, reason: err instanceof Error ? err.message : 'unknown' });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[cron] evaluate-signal-trades done · resolved=${resolved.length} · pending=${pendingCount} · skipped=${skipped.length}`
  );

  return NextResponse.json({
    resolved_count: resolved.length,
    pending_count: pendingCount,
    skipped_count: skipped.length,
    resolved,
    skipped,
  });
}

/** Inserta la fila de outcome. Devuelve el error de postgrest (o null si OK). */
async function persist(
  admin: ReturnType<typeof createSupabaseAdmin>,
  c: CandidateRow,
  fields: {
    direction: 'buy' | 'sell' | null;
    entry_type: string | null;
    outcome: string;
    exit_price: number | null;
    return_pct: number | null;
    r_multiple: number | null;
    resolved_days: number | null;
  }
): Promise<{ code: string; message: string } | null> {
  const { error } = await admin.from('signal_trade_outcomes').insert({
    signal_id: c.id,
    direction: fields.direction,
    entry_type: fields.entry_type,
    timeframe: '1D',
    outcome: fields.outcome,
    entry: c.entry_price,
    stop_loss: c.stop_loss,
    target: c.target_price,
    exit_price: fields.exit_price,
    return_pct: fields.return_pct,
    r_multiple: fields.r_multiple,
    resolved_days: fields.resolved_days,
  });
  return error ? { code: error.code ?? '', message: error.message } : null;
}
