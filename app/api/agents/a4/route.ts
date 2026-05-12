import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z.object({
  ticker: z.string().min(1).max(20).toUpperCase(),
});

/**
 * Orquestador A4.
 *
 * Flujo:
 *   1. Fetch market data (paralelo, cacheado en Upstash)
 *   2. Lanza A1, A2, A3 en paralelo (Promise.all). A3 sólo recibe ticker + OHLCV.
 *   3. Si A1.anomaly_detected || A2.opportunity_detected → debate.
 *   4. A4 ensambla (A1, A2, A3, debate?) → output final.
 *
 * Coste por llamada (sin cache): 5 calls a Alpha Vantage = 1 minuto del rate-limit
 * y 5/25 del límite diario. El caché Upstash es crítico.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const { ticker } = parsed.data;

  // Auth — proteger gasto de tokens contra acceso anonimo
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    // Step 1: market data fan-out
    const [q, ov, news, daily, intraday] = await Promise.all([
      quote(ticker).then(normalizeQuote),
      overview(ticker).then(normalizeOverview).catch(() => null),
      newsSentiment(ticker, 5).then((n) => normalizeNews(n, 5)).catch(() => []),
      timeSeriesDaily(ticker).then(normalizeDaily).catch(() => []),
      timeSeriesIntraday(ticker, '60min').then((d) => normalizeIntraday(d, '60min')).catch(() => []),
    ]);

    if (!q) {
      return NextResponse.json({ error: 'no_quote', detail: `Sin cotización para ${ticker}` }, { status: 404 });
    }

    const market_snapshot = {
      quote: {
        current: q.current,
        change_pct_24h: q.change_pct_24h,
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

    // Step 2: agents in parallel — A3 ONLY receives ticker + ohlcv (regla absoluta)
    const [a1, a2, a3] = await Promise.all([
      runA1({ ticker, market_snapshot }),
      runA2({ ticker, macro_snapshot: {} }),
      runA3({ ticker, ohlcv }),
    ]);

    // Step 3: debate condicional
    let debate = null;
    if (a1.anomaly_detected || a2.opportunity_detected) {
      debate = await runDebate({ a1, a2 });
    }

    // Step 4: A4 ensambla
    const a4 = await runA4({ a1, a2, a3, debate });
    const latency_ms = Date.now() - startedAt;

    // Step 5: persistir en analyses_log (admin client bypasea RLS).
    // No bloquea la respuesta si el log falla — solo se pierde la entrada.
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
        tokens_used: null,
      } as any);
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[a4] failed to persist analyses_log:', logErr instanceof Error ? logErr.message : logErr);
    }

    return NextResponse.json({ a1, a2, a3, debate, a4 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    const payload: Record<string, unknown> = { error: 'Orchestration failed', detail: msg };
    // Surface zod issues from AgentParseError so the client can see WHY validation failed
    if (err && typeof err === 'object' && 'zodIssues' in err) {
      payload.zodIssues = (err as { zodIssues: unknown }).zodIssues;
      payload.agent = (err as { agent?: string }).agent;
    }
    return NextResponse.json(payload, { status: 500 });
  }
}
