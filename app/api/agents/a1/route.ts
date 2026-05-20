import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runA1 } from '@/agents/a1/client';
import { fallbackQuote, fallbackOverview, fallbackNewsSentiment } from '@/lib/market/finnhub';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z
  .object({
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/=^]+$/i, 'ticker invalido').toUpperCase(),
  })
  .strict();

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const { ticker } = parsed.data;

  try {
    // Fan-out de market data — Finnhub (overview+news) + Yahoo (quote).
    const [q, ov, news] = await Promise.all([
      fallbackQuote(ticker).catch(() => null),
      fallbackOverview(ticker).catch(() => null),
      fallbackNewsSentiment(ticker, 5).catch(() => []),
    ]);

    if (!q) {
      return NextResponse.json({ error: 'no_quote', detail: `Sin cotización para ${ticker}` }, { status: 404 });
    }

    const market_snapshot = {
      quote: {
        current: q.current,
        change_pct_24h: q.change_pct_24h,
        change_pct_7d: 0, // TODO: derivar de daily candles si lo necesita A1
        currency: ov?.currency ?? ('currency' in q ? q.currency : undefined) ?? 'USD',
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
