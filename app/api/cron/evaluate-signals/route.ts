/**
 * /api/cron/evaluate-signals — Modo B de backtesting
 *
 * Disparado por Vercel Cron 1x/dia. Encuentra analyses_log con horizon
 * (7d, 30d) madurado SIN entrada en signal_outcomes, fetcha precio actual,
 * scorea segun reglas v1 (threshold 2%), persiste outcome.
 *
 * Seguridad: protegido con CRON_SECRET (header Authorization Bearer ...).
 * Vercel Cron inyecta automaticamente este header si CRON_SECRET esta en
 * el entorno y el cron esta definido en vercel.json.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { requireCronSecret } from '@/lib/api-helpers';
import { fallbackQuote } from '@/lib/market/finnhub';
import { scoreSignal, dbToScoringDirection, extractAtrPct, volatilityThresholdPct } from '@/lib/scoring';
import type { Direction as DbDirection } from '@/types/db';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HORIZONS_DAYS = [7, 30] as const;

// initial_price / initial_price_at son nullable en la fila; la query filtra
// initial_price IS NOT NULL en runtime, pero el tipo refleja el schema real.
interface PendingAnalysis {
  id: string;
  ticker: string;
  direction: DbDirection;
  initial_price: number | null;
  initial_price_at: string | null;
  a3_output: unknown;
}

export async function GET(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;

  const admin = createSupabaseAdmin();
  const now = Date.now();
  const evaluated: { analysis_id: string; horizon_days: number; hit: boolean }[] = [];
  const skipped: { analysis_id: string; reason: string }[] = [];

  for (const horizon of HORIZONS_DAYS) {
    // Maturity cutoff: analisis con initial_price_at <= (now - horizon dias)
    const cutoffISO = new Date(now - horizon * 86_400_000).toISOString();

    // HORIZONTE EFECTIVO = [h, h+1) días, NO exactamente h. El cron corre 1x/día
    // y puntúa con el precio ACTUAL (fallbackQuote) en la primera ejecución en
    // que initial_price_at <= now - h. Como entre ejecuciones pasan 24h, la
    // antigüedad real de la fila al puntuar cae en [h, h+1) días (p.ej. "7d" mide
    // entre 7.0 y 8.0 días; "30d" entre 30.0 y 31.0). Solo se desvía si la fila
    // se saltó (quote_unavailable, error) y se recoge en un run posterior: ahí
    // puede superar h+1. La antigüedad real es auditable como
    // signal_outcomes.evaluated_at − analyses_log.initial_price_at.
    // Cualquier tasa por horizonte (calibración, tasa base) hereda esta ventana.

    // Trae candidatos: con initial_price_at <= cutoff, que NO tengan ya
    // outcome para este horizon. Postgrest no soporta NOT EXISTS limpio
    // con embedding; hacemos dos queries y diffeamos en memoria.
    const { data: candidates, error: candErr } = await admin
      .from('analyses_log')
      .select('id, ticker, direction, initial_price, initial_price_at, a3_output')
      .not('initial_price', 'is', null)
      .lte('initial_price_at', cutoffISO)
      .limit(500);

    if (candErr) {
      // eslint-disable-next-line no-console
      console.error(`[cron] candidates query failed (h=${horizon}):`, candErr.message);
      continue;
    }
    if (!candidates || candidates.length === 0) continue;

    const { data: existing, error: existErr } = await admin
      .from('signal_outcomes')
      .select('analysis_id')
      .eq('horizon_days', horizon)
      .in(
        'analysis_id',
        candidates.map((c) => c.id)
      );

    if (existErr) {
      // eslint-disable-next-line no-console
      console.error(`[cron] existing query failed (h=${horizon}):`, existErr.message);
      continue;
    }

    const evaluatedIds = new Set<string>(
      (existing ?? []).map((e: { analysis_id: string }) => e.analysis_id)
    );
    const pending: PendingAnalysis[] = candidates.filter(
      (c: PendingAnalysis) => !evaluatedIds.has(c.id)
    );

    for (const a of pending) {
      try {
        const q = await fallbackQuote(a.ticker);
        if (!q || !q.current) {
          skipped.push({ analysis_id: a.id, reason: 'quote_unavailable' });
          continue;
        }
        // Umbral de hit volatility-adjusted: max(2%, k·ATR%). Para BTC (ATR ~3-4%)
        // sube el listón; para una equity (ATR ~1%) se queda en el piso del 2%.
        const atrPct = extractAtrPct(a.a3_output, Number(a.initial_price));
        const scored = scoreSignal({
          direccion: dbToScoringDirection(a.direction),
          initial_price: Number(a.initial_price),
          eval_price: q.current,
          threshold_pct: volatilityThresholdPct(atrPct),
        });
        const { error: insErr } = await admin.from('signal_outcomes').insert({
          analysis_id: a.id,
          horizon_days: horizon,
          eval_price: q.current,
          return_pct: scored.return_pct,
          hit: scored.hit,
        });
        if (insErr) {
          // Conflict (ya evaluado por otra ejecucion paralela) → ignora
          if (insErr.code !== '23505') {
            // eslint-disable-next-line no-console
            console.error(`[cron] insert outcome failed:`, insErr.message);
            Sentry.captureMessage('cron evaluate-signals insert failed', {
              extra: { analysis_id: a.id, horizon, error: insErr.message },
            });
          }
          continue;
        }
        evaluated.push({ analysis_id: a.id, horizon_days: horizon, hit: scored.hit });
      } catch (err) {
        skipped.push({
          analysis_id: a.id,
          reason: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[cron] evaluate-signals done · evaluated=${evaluated.length} · skipped=${skipped.length}`);

  return NextResponse.json({
    evaluated_count: evaluated.length,
    skipped_count: skipped.length,
    evaluated,
    skipped,
  });
}
