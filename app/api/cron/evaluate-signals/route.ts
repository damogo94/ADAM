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
import { fallbackQuote } from '@/lib/market/finnhub';
import { scoreSignal, SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K, type Direction } from '@/lib/scoring';
import type { Direction as DbDirection } from '@/types/db';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HORIZONS_DAYS = [7, 30] as const;

// La columna `direction` de analyses_log usa el vocabulario del enum
// direction_t (positivo/negativo/neutral); scoreSignal usa alcista/bajista/
// neutral. Mapeo explícito — sin él, las señales direccionales nunca
// matcheaban una rama y siempre puntuaban hit=false.
const DB_TO_SCORING_DIRECTION: Record<DbDirection, Direction> = {
  positivo: 'alcista',
  negativo: 'bajista',
  neutral: 'neutral',
};

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

/**
 * ATR% del activo al momento del análisis, desde a3_output.operativa.atr_actual.
 * Usado para hacer el umbral de hit volatility-adjusted. null si no hay ATR
 * (runs antiguos, velas insuficientes, precio inválido) → el caller cae al 2% fijo.
 */
function extractAtrPct(a3: unknown, initialPrice: number): number | null {
  if (!a3 || typeof a3 !== 'object' || !Number.isFinite(initialPrice) || initialPrice <= 0) {
    return null;
  }
  const op = (a3 as { operativa?: { atr_actual?: unknown } }).operativa;
  const atr = op?.atr_actual;
  if (typeof atr !== 'number' || !Number.isFinite(atr) || atr <= 0) return null;
  return (atr / initialPrice) * 100;
}

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron pasa CRON_SECRET como Bearer
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const now = Date.now();
  const evaluated: { analysis_id: string; horizon_days: number; hit: boolean }[] = [];
  const skipped: { analysis_id: string; reason: string }[] = [];

  for (const horizon of HORIZONS_DAYS) {
    // Maturity cutoff: analisis con initial_price_at <= (now - horizon dias)
    const cutoffISO = new Date(now - horizon * 86_400_000).toISOString();

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
        const thresholdPct =
          atrPct != null ? Math.max(SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K * atrPct) : SIGNAL_THRESHOLD_PCT;
        const scored = scoreSignal({
          direccion: DB_TO_SCORING_DIRECTION[a.direction],
          initial_price: Number(a.initial_price),
          eval_price: q.current,
          threshold_pct: thresholdPct,
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
