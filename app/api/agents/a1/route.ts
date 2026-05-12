import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runA1 } from '@/agents/a1/client';
import {
  quote,
  overview,
  newsSentiment,
  normalizeQuote,
  normalizeOverview,
  normalizeNews,
} from '@/lib/market/alphavantage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z.object({
  ticker: z.string().min(1).max(20).toUpperCase(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const { ticker } = parsed.data;

  try {
    // Fan-out — Alpha Vantage rate limit es estricto, pero los 3 endpoints
    // tienen TTLs distintos en el caché, así que la mayoría de calls son cache hits.
    const [q, ov, news] = await Promise.all([
      quote(ticker).then(normalizeQuote),
      overview(ticker).then(normalizeOverview).catch(() => null),
      newsSentiment(ticker, 5).then((n) => normalizeNews(n, 5)).catch(() => []),
    ]);

    if (!q) {
      return NextResponse.json({ error: 'no_quote', detail: `Sin cotización para ${ticker}` }, { status: 404 });
    }

    const market_snapshot = {
      quote: {
        current: q.current,
        change_pct_24h: q.change_pct_24h,
        change_pct_7d: 0, // TODO: derivar de TIME_SERIES_DAILY en Sprint 2
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

    const result = await runA1({ ticker, market_snapshot });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'A1 failed', detail: msg }, { status: 500 });
  }
}
