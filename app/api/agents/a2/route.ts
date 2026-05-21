/**
 * POST /api/agents/a2 — Ejecuta A2 (Macro) en aislamiento.
 *
 * Architecture decision (2026-05-21): A2 se desacopla del pipeline principal
 * porque sus 25s peor caso saturaban el budget de 60s del lambda Hobby. Ahora:
 *
 *   - `/api/agents/run` ejecuta A1+A3 paralelos + Debate + A4 (~38s peak)
 *   - Este endpoint corre A2 en su PROPIO lambda con su PROPIO budget de 60s
 *   - Frontend dispara ambos en paralelo desde /analysis page
 *   - narrateA2 internamente lee/escribe a2_cache → segunda petición instant
 *
 * Mismas defensas que /api/agents/run: CSRF, IP rate-limit, auth.
 * Refetch del macro_snapshot (con su propio cache diario) para no depender
 * del pipeline principal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { narrateA2 } from '@/agents/a2/narrate';
import { fallbackQuote, fallbackNewsSentiment } from '@/lib/market/finnhub';
import { getMacroSnapshot } from '@/lib/market/macro';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import type { MarketSnapshot } from '@/agents/shared/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z
  .object({
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/=^]+$/i, 'ticker invalido').toUpperCase(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const csrf = checkSameOrigin(req);
    if (csrf) return csrf;
    const ipLimit = await rateLimitByIP(req, 'analysis');
    if (ipLimit) return ipLimit;

    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { ticker } = parsed.data;

    // Macro snapshot (con su propio cache diario en macro_snapshots_cache).
    // Si esta caliente, ~50ms. Si frio, hasta 3s (hard timeout en macro.ts).
    const macro = await getMacroSnapshot();

    // A2 prompt menciona news/quote como anclas opcionales del contexto del
    // ticker. Para que el output sea coherente con el del pipeline (que SI
    // los pasa via MarketSnapshot completo), incluimos lo minimo.
    // Best-effort: si fallan, narrateA2 sigue con macro como ancla principal.
    const [q, news] = await Promise.all([
      fallbackQuote(ticker).catch(() => null),
      fallbackNewsSentiment(ticker, 3).catch(() => []),
    ]);

    const snapshot: MarketSnapshot = {
      ticker,
      quote: {
        current: q?.current ?? 0,
        change_pct_24h: q?.change_pct_24h ?? 0,
        change_pct_7d: 0,
        currency: 'USD',
      },
      fundamentals: {
        per: null,
        peg: null,
        ev_ebitda: null,
        fcf_yield_pct: null,
        dividend_yield_pct: null,
        market_cap_usd: null,
      },
      news,
      ohlcv_daily: [],
      ohlcv_intraday: [],
      macro_snapshot: macro as unknown as Record<string, unknown>,
    };

    const t0 = Date.now();
    const a2 = await narrateA2(ticker, snapshot);
    const durationMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[a2-standalone] ticker=${ticker} duration=${durationMs}ms user=${user.id.slice(0, 8)}`);

    return NextResponse.json({ a2, meta: { durationMs } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    Sentry.captureException(err, {
      tags: { endpoint: 'api/agents/a2-standalone' },
    });
    // eslint-disable-next-line no-console
    console.error('[a2-standalone] failed:', msg);
    return NextResponse.json({ error: 'a2_failed', detail: msg }, { status: 500 });
  }
}
