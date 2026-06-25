/**
 * /api/cron/a2-reconcile — Cierra el gap de A2 por los dos lados (server-side).
 *
 * Contexto: el flujo web de /analysis corre /api/agents/run con A2 desde caché
 * (skipA2Narrate). En el primer análisis de un ticker la caché está fría → A2
 * null → la fila de analyses_log se hornea degradada. El "rescate" (fetch
 * paralelo de /api/agents/a2 + re-narración de A4) lo orquesta el CLIENTE, así
 * que si el usuario navega antes de que resuelva, la fila se queda sin A2.
 * Medido en prod: ~80% de los análisis quedan sin a2_output.
 *
 * Este cron ataca el problema sin depender del cliente:
 *
 *   FASE A · PRE-WARM (prevención)
 *     Narra A2 para los tickers distintos de las watchlists → calienta a2_cache
 *     a la macro_as_of de hoy. Cuando un usuario analiza uno de esos tickers,
 *     /run lee A2 de caché caliente y la fila nace con A2.
 *     Barato: narrateA2 SOLO consume el snapshot macro (global), no pega a
 *     Finnhub/Yahoo por ticker.
 *
 *   FASE B · BACKFILL (cura)
 *     Encuentra filas recientes con a2_output IS NULL, narra A2 (cache hit de la
 *     Fase A o fresh) y RE-CONSOLIDA A4 server-side, persistiendo a2_output +
 *     confluence_pct + ejes Fase 1 + direction/confidence. 100% en el servidor,
 *     sin depender de que el cliente siga en la página.
 *
 *     Ventana de seguridad: SOLO filas < BACKFILL_WINDOW_HOURS. signal_outcomes
 *     se emite cuando la fila cumple el horizonte mínimo (7d), así que una fila
 *     reciente AÚN no tiene outcome → re-narrar (y cambiar direction) es seguro,
 *     no corrompe la calibración ya medida.
 *
 * Seguridad: CRON_SECRET (Bearer). Mismo patrón que el resto de crons.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { narrateA2 } from '@/agents/a2/narrate';
import { getMacroSnapshot } from '@/lib/market/macro';
import { consolidateAndPersistA4 } from '@/agents/a4/consolidate';
import { type DebateForConfluence } from '@/agents/a4/compute';
import {
  A1Output,
  A2Output,
  A3Output,
  type MarketSnapshot,
  type A2Output_t,
} from '@/agents/shared/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const WARM_CAP = 20; // tickers distintos de watchlist a pre-calentar
const BACKFILL_CAP = 12; // filas null-A2 a rellenar por ejecución
const BACKFILL_WINDOW_HOURS = 72; // < 7d (horizonte mínimo de signal_outcomes)
const TIME_BUDGET_MS = 240_000; // corta antes de que Vercel mate el lambda (300s)

/**
 * Snapshot stub para narrateA2 — solo macro_snapshot se lee (ver
 * agents/a2/narrate.ts). Replica el patrón de /api/agents/a2.
 */
function macroStub(ticker: string, macro: MarketSnapshot['macro_snapshot']): MarketSnapshot {
  return {
    ticker,
    quote: { current: 0, change_pct_24h: 0, change_pct_7d: 0, currency: 'USD' },
    fundamentals: {
      per: null,
      peg: null,
      ev_ebitda: null,
      fcf_yield_pct: null,
      dividend_yield_pct: null,
      market_cap_usd: null,
    },
    news: [],
    ohlcv_daily: [],
    ohlcv_intraday: [],
    macro_snapshot: macro,
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  const admin = createSupabaseAdmin();

  // Macro de hoy (cache diario propio). Sin as_of, narrateA2 no cachea → no tiene
  // sentido calentar; igual seguimos con backfill (narra A2 aunque no persista cache).
  const macro = await getMacroSnapshot();

  // ── FASE A · PRE-WARM ──────────────────────────────────────────────────────
  let warmed = 0;
  let warmErrors = 0;
  try {
    const { data: items } = await admin.from('watchlist_items').select('ticker');
    const tickers = [...new Set((items ?? []).map((i) => i.ticker))].slice(0, WARM_CAP);
    for (const ticker of tickers) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break;
      try {
        // narrateA2 mira caché primero: hit → 0 tokens; miss → narra + persiste.
        await narrateA2(ticker, macroStub(ticker, macro), { timeoutMs: 30_000 });
        warmed++;
      } catch {
        warmErrors++;
      }
    }
  } catch (err) {
    Sentry.captureMessage('cron a2-reconcile warm phase failed', {
      extra: { error: err instanceof Error ? err.message : String(err) },
    });
  }

  // ── FASE B · BACKFILL ──────────────────────────────────────────────────────
  let backfilled = 0;
  let backfillErrors = 0;
  let backfillSkipped = 0;
  try {
    const cutoffISO = new Date(Date.now() - BACKFILL_WINDOW_HOURS * 3_600_000).toISOString();
    const { data: rows, error } = await admin
      .from('analyses_log')
      .select('id, user_id, ticker, a1_output, a3_output, debate_output, created_at')
      .is('a2_output', null)
      .not('a3_output', 'is', null)
      .gte('created_at', cutoffISO)
      .order('created_at', { ascending: false })
      .limit(BACKFILL_CAP);

    if (error) {
      Sentry.captureMessage('cron a2-reconcile backfill query failed', {
        extra: { error: error.message },
      });
    }

    for (const row of rows ?? []) {
      if (Date.now() - t0 > TIME_BUDGET_MS) break;

      // a3 es obligatorio para que A4 tenga la pata técnica; sin él, skip.
      const a3Parsed = A3Output.safeParse(row.a3_output);
      if (!a3Parsed.success) {
        backfillSkipped++;
        continue;
      }
      const a1Parsed = A1Output.safeParse(row.a1_output);
      const a1 = a1Parsed.success ? a1Parsed.data : null;

      const debate = parseDebate(row.debate_output);

      let a2: A2Output_t | null = null;
      try {
        a2 = await narrateA2(row.ticker, macroStub(row.ticker, macro), { timeoutMs: 30_000 });
      } catch {
        // A2 no disponible ahora → no podemos rellenar esta fila; reintento futuro.
        backfillErrors++;
        continue;
      }
      if (!a2) {
        backfillErrors++;
        continue;
      }

      try {
        await consolidateAndPersistA4({
          ticker: row.ticker,
          a1,
          a2,
          a3: a3Parsed.data,
          debate,
          analysisId: row.id,
          userId: row.user_id,
        });
        backfilled++;
      } catch {
        backfillErrors++;
      }
    }
  } catch (err) {
    Sentry.captureMessage('cron a2-reconcile backfill phase failed', {
      extra: { error: err instanceof Error ? err.message : String(err) },
    });
  }

  const durationMs = Date.now() - t0;
  // eslint-disable-next-line no-console
  console.log(
    `[cron] a2-reconcile done · warmed=${warmed}(err=${warmErrors}) · ` +
      `backfilled=${backfilled}(err=${backfillErrors},skip=${backfillSkipped}) · ${durationMs}ms`
  );

  return NextResponse.json({
    warmed,
    warm_errors: warmErrors,
    backfilled,
    backfill_errors: backfillErrors,
    backfill_skipped: backfillSkipped,
    duration_ms: durationMs,
  });
}

/**
 * Extrae el subset DebateForConfluence del debate_output persistido (Json).
 * Tolerante: si falta o no cuadra, devuelve null (debate es opcional para A4).
 */
function parseDebate(raw: unknown): DebateForConfluence | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as { convergence_score?: unknown; direccion?: unknown };
  const score = typeof d.convergence_score === 'number' ? d.convergence_score : null;
  const dir = d.direccion;
  if (score === null) return null;
  if (dir !== 'alcista' && dir !== 'bajista' && dir !== 'neutral') return null;
  return { convergence_score: score, direccion: dir };
}
