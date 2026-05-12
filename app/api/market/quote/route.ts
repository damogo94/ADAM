import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { quote, normalizeQuote } from '@/lib/market/alphavantage';

export const runtime = 'edge';

const RequestSchema = z.object({
  symbol: z.string().min(1).max(20),
});

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const parsed = RequestSchema.safeParse({ symbol });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }
  try {
    const raw = await quote(parsed.data.symbol.toUpperCase());
    const q = normalizeQuote(raw);
    if (!q) {
      return NextResponse.json({ error: 'no_quote' }, { status: 404 });
    }
    return NextResponse.json(q, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Quote failed', detail: msg }, { status: 502 });
  }
}
