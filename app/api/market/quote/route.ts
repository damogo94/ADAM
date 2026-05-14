import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { quote, normalizeQuote, timeSeriesDaily, normalizeDaily } from '@/lib/market/alphavantage';
import { fallbackQuote, fallbackDaily } from '@/lib/market/finnhub';

export const runtime = 'edge';

const SYMBOL_REGEX = /^[A-Z0-9.\-/]+$/i;
const RequestSchema = z.object({
  symbol: z.string().min(1).max(20).regex(SYMBOL_REGEX, 'invalid symbol'),
});

/**
 * GET /api/market/quote?symbol=AAPL[&spark=1]
 *
 * Devuelve { current, previous_close, change_pct_24h, volume, latest_day }.
 * Si `spark=1`, añade `spark7d: number[]` con los últimos 7 closes.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const wantSpark = req.nextUrl.searchParams.get('spark') === '1';
  const parsed = RequestSchema.safeParse({ symbol });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }
  const sym = parsed.data.symbol.toUpperCase();

  try {
    // AV primary — si falla, fallback Finnhub/Yahoo. Misma cascada que A4.
    const [rawQuote, dailyCandles] = await Promise.all([
      quote(sym).catch(() => null),
      wantSpark ? timeSeriesDaily(sym).then(normalizeDaily).catch(() => []) : Promise.resolve([]),
    ]);

    let q = rawQuote ? normalizeQuote(rawQuote) : null;
    if (!q) {
      const fb = await fallbackQuote(sym).catch(() => null);
      if (fb) q = fb;
    }

    let spark = dailyCandles;
    if (wantSpark && spark.length < 5) {
      spark = await fallbackDaily(sym).catch(() => []);
    }

    if (!q) {
      return NextResponse.json({ error: 'no_quote' }, { status: 404 });
    }

    const spark7d = wantSpark ? spark.slice(-7).map((c) => c.c) : undefined;

    return NextResponse.json(
      { ...q, ...(spark7d && spark7d.length >= 2 ? { spark7d } : {}) },
      { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Quote failed', detail: msg }, { status: 502 });
  }
}
