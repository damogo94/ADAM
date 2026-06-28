import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fallbackQuote, fallbackDaily } from '@/lib/market/finnhub';
import { rateLimitByIP } from '@/lib/api-helpers';

// Node runtime: rateLimitByIP usa @upstash/redis (no Edge). Auditoría Fase 0 · #2.
export const runtime = 'nodejs';

const SYMBOL_REGEX = /^[A-Z0-9.\-/=^]+$/i;
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
  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

  const symbol = req.nextUrl.searchParams.get('symbol');
  const wantSpark = req.nextUrl.searchParams.get('spark') === '1';
  const parsed = RequestSchema.safeParse({ symbol });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }
  const sym = parsed.data.symbol.toUpperCase();

  try {
    const [q, spark] = await Promise.all([
      fallbackQuote(sym).catch(() => null),
      wantSpark ? fallbackDaily(sym).catch(() => []) : Promise.resolve([]),
    ]);

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
