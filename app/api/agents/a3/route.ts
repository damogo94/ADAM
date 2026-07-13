import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runA3 } from '@/agents/a3/client';
import { fallbackDaily, fallbackIntraday } from '@/lib/market/finnhub';
import { requireApiUser } from '@/lib/auth/api-user';
import { TickerField } from '@/lib/api-schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ⚠️ Endpoint de A3.
 * Sólo acepta { ticker }. NO acepta context, news, macro, sentiment.
 * Si en el futuro se añade un campo, debe ser strict OHLCV.
 * `TickerField` lleva la regex anti prompt-injection (chars válidos en tickers reales).
 */
const RequestSchema = z.object({ ticker: TickerField }).strict(); // .strict() rechaza extras — capa 3 del aislamiento A3

export async function POST(req: NextRequest) {
  const gate = await requireApiUser(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const { ticker } = parsed.data;

  try {
    const [daily, intraday] = await Promise.all([
      fallbackDaily(ticker).catch(() => []),
      fallbackIntraday(ticker).catch(() => []),
    ]);

    const ohlcv = [
      { timeframe: '1D', candles: daily.slice(-100) }, // last 100 days
      { timeframe: '1H', candles: intraday.slice(-100) }, // last 100 intraday bars
    ];

    const result = await runA3({ ticker, ohlcv });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'A3 failed', detail: msg }, { status: 500 });
  }
}
