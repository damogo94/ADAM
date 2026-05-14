import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { quote, normalizeQuote, timeSeriesDaily, normalizeDaily } from '@/lib/market/alphavantage';
import { fallbackQuote, fallbackDaily } from '@/lib/market/finnhub';

export const runtime = 'edge';
export const maxDuration = 60;

const SYMBOL_REGEX = /^[A-Z0-9.\-/]+$/i;

const RequestSchema = z.object({
  symbols: z.string().min(1).max(500),
  spark: z.string().optional(),
});

interface QuoteRow {
  symbol: string;
  current?: number;
  previous_close?: number;
  change_pct_24h?: number;
  volume?: number;
  latest_day?: string;
  spark7d?: number[];
  error?: string;
}

/**
 * GET /api/market/quotes?symbols=AAPL,BTC-USD,EUR-USD[&spark=1]
 *
 * Devuelve N cotizaciones (max 20) en una sola llamada. Internamente paraleliza
 * pero el cache L1/L2 absorbe lo repetido. Solo penaliza la primera vez.
 *
 * Reemplaza el patron de N llamadas paralelas a /api/market/quote desde el
 * cliente, que quemaba el rate-limit AV en 10+ tickers.
 */
export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols');
  const sparkFlag = req.nextUrl.searchParams.get('spark') === '1';
  const parsed = RequestSchema.safeParse({ symbols, spark: req.nextUrl.searchParams.get('spark') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }

  const list = parsed.data.symbols
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && s.length <= 20 && SYMBOL_REGEX.test(s)) // regex anti-abuse + cap len
    .slice(0, 20); // cap defensivo — sin esto un attacker podría pedir 1000 tickers

  if (list.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  const results = await Promise.all(
    list.map(async (sym): Promise<QuoteRow> => {
      try {
        // Yahoo PRIMARY (realtime, matches Investing/TradingView), AV fallback.
        const [yhQuote, yhSpark] = await Promise.all([
          fallbackQuote(sym).catch(() => null),
          sparkFlag ? fallbackDaily(sym).catch(() => []) : Promise.resolve([]),
        ]);
        let q = yhQuote;
        if (!q) {
          const raw = await quote(sym).catch(() => null);
          if (raw) q = normalizeQuote(raw);
        }
        if (!q) return { symbol: sym, error: 'no_quote' };
        let spark = yhSpark;
        if (sparkFlag && spark.length < 5) {
          spark = await timeSeriesDaily(sym).then(normalizeDaily).catch(() => []);
        }
        const spark7d = sparkFlag ? spark.slice(-7).map((c) => c.c) : undefined;
        return {
          symbol: sym,
          current: q.current,
          previous_close: q.previous_close,
          change_pct_24h: q.change_pct_24h,
          volume: q.volume,
          latest_day: q.latest_day,
          ...(spark7d && spark7d.length >= 2 ? { spark7d } : {}),
        };
      } catch (err) {
        return { symbol: sym, error: err instanceof Error ? err.message : 'unknown' };
      }
    })
  );

  return NextResponse.json(
    { quotes: results },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } }
  );
}
