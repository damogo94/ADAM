/**
 * GET /api/market/sparklines?symbols=AAPL,BTC-USD,EUR-USD&range=30d
 *
 * Devuelve las series de cierre para N símbolos en UNA sola llamada.
 *
 * Flujo por símbolo:
 *   1. Lookup en cache Upstash (clave `spark:{sym}:{range}`, TTL 15min).
 *   2. Si hit → uso. Si miss → `fallbackDaily(symbol)` (Yahoo, sin cuota),
 *      construyo serie y escribo en cache.
 *
 * Performance:
 *   - Hits paralelos al cache.
 *   - Misses paralelos a Yahoo (sin sleep — Yahoo /v8/chart no tiene
 *     cuota oficial estricta).
 *   - Cap a 20 símbolos por request (defensive).
 *
 * Auth: solo rate limit IP (bucket 'quote', 60/min). Endpoint barato y
 * los precios no son privados — no requerimos cookie session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitByIP } from '@/lib/api-helpers';
import { fallbackDaily } from '@/lib/market/finnhub';
import { readCache, writeCache } from '@/lib/sparkline/cache';
import { buildSeriesCloses } from '@/lib/sparkline/build-series';
import { SparklineRange, type SparklineSeries_t, type SparklinesResponse_t } from '@/lib/sparkline/types';

export const runtime = 'nodejs';

const MAX_SYMBOLS = 20;
const SYMBOL_REGEX = /^[A-Z0-9.\-/=^]+$/i;

const RequestSchema = z.object({
  symbols: z.string().min(1).max(500),
  range: SparklineRange.default('30d'),
});

export async function GET(req: NextRequest) {
  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

  const parsed = RequestSchema.safeParse({
    symbols: req.nextUrl.searchParams.get('symbols') ?? '',
    range: req.nextUrl.searchParams.get('range') ?? '30d',
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', issues: parsed.error.issues.slice(0, 3) },
      { status: 400 }
    );
  }

  const list = parsed.data.symbols
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0 && s.length <= 20 && SYMBOL_REGEX.test(s))
    .slice(0, MAX_SYMBOLS);

  if (list.length === 0) {
    const empty: SparklinesResponse_t = { series: [], generated_at: new Date().toISOString() };
    return NextResponse.json(empty);
  }

  const range = parsed.data.range;
  const nowIso = new Date().toISOString();

  const series: SparklineSeries_t[] = await Promise.all(
    list.map(async (symbol): Promise<SparklineSeries_t> => {
      // 1) Cache hit?
      const cached = await readCache(symbol, range);
      if (cached) return cached;

      // 2) Miss → Yahoo
      try {
        const candles = await fallbackDaily(symbol);
        const closes = buildSeriesCloses(candles, range);
        const built: SparklineSeries_t = {
          symbol,
          range,
          closes,
          generated_at: nowIso,
          cached: false,
          ...(closes.length === 0 ? { error: 'no_data' } : {}),
        };
        // Solo cacheamos si vino con datos — un error transitorio de Yahoo
        // no debe perpetuarse 15min.
        if (closes.length > 0) {
          await writeCache(built);
        }
        return built;
      } catch (err) {
        return {
          symbol,
          range,
          closes: [],
          generated_at: nowIso,
          cached: false,
          error: err instanceof Error ? err.message : 'unknown',
        };
      }
    })
  );

  const body: SparklinesResponse_t = { series, generated_at: nowIso };
  return NextResponse.json(body, {
    headers: {
      // CDN-friendly: las series cambian a EOD; 60s de cache compartida
      // con SWR de 5min cubre el caso de muchos clientes pidiendo lo mismo.
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
