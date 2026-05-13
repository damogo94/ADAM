import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runA3 } from '@/agents/a3/client';
import {
  timeSeriesDaily,
  timeSeriesIntraday,
  normalizeDaily,
  normalizeIntraday,
} from '@/lib/market/alphavantage';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ⚠️ Endpoint de A3.
 * Sólo acepta { ticker }. NO acepta context, news, macro, sentiment.
 * Si en el futuro se añade un campo, debe ser strict OHLCV.
 */
const RequestSchema = z
  .object({
    // regex anti prompt-injection — sólo chars válidos en tickers reales
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/]+$/i, 'ticker invalido').toUpperCase(),
  })
  .strict(); // .strict() rechaza campos adicionales — extra defense

export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

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
    const [daily, intraday] = await Promise.all([
      timeSeriesDaily(ticker).then(normalizeDaily).catch(() => []),
      timeSeriesIntraday(ticker, '60min').then((d) => normalizeIntraday(d, '60min')).catch(() => []),
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
