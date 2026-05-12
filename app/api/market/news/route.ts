import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { newsSentiment, normalizeNews } from '@/lib/market/alphavantage';

export const runtime = 'edge';

const RequestSchema = z.object({
  symbol: z.string().min(1).max(20),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const limit = req.nextUrl.searchParams.get('limit') ?? undefined;
  const parsed = RequestSchema.safeParse({ symbol, limit });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  try {
    const raw = await newsSentiment(parsed.data.symbol.toUpperCase(), parsed.data.limit);
    const items = normalizeNews(raw, parsed.data.limit);
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'News failed', detail: msg }, { status: 502 });
  }
}
