/**
 * Cache Upstash Redis para series de sparkline.
 *
 * Clave: `spark:{symbol}:{range}` · TTL: 15 min (intradía).
 * Sparklines son mini-tendencias visuales — un TTL de 15min ahorra
 * ~90% de llamadas a Yahoo en un panel típico con refresh frecuente,
 * sin perder la inmediatez de los movimientos diarios (los closes solo
 * cambian a EOD).
 *
 * Failure modes (best-effort, jamás tira):
 *   - Sin Upstash configurado (dev) → siempre miss → todas las series
 *     se calculan en vivo. Funciona pero más lento.
 *   - Read error → miss silencioso, caller fetchea de Yahoo.
 *   - Write error → log + ignore; próxima petición re-calcula.
 *   - Payload corrupt en cache → ignoramos como miss.
 */

import 'server-only';
import { getRedisClient } from '@/lib/ratelimit';
import { SparklineSeries, type SparklineSeries_t, type SparklineRange_t } from './types';

const TTL_SECONDS = 15 * 60; // 15 min

function cacheKey(symbol: string, range: SparklineRange_t): string {
  return `spark:${symbol.toUpperCase()}:${range}`;
}

/** Lee del cache si existe y el payload es válido. null en cualquier failure. */
export async function readCache(
  symbol: string,
  range: SparklineRange_t
): Promise<SparklineSeries_t | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey(symbol, range));
    if (!raw) return null;
    // @upstash/redis devuelve el valor parseado automáticamente si se
    // guardó con redis.set(... , JSON-able). Tipado lo cubrimos con Zod.
    const parsed = SparklineSeries.safeParse(raw);
    if (!parsed.success) return null;
    return { ...parsed.data, cached: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sparkline-cache] read failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Escribe en cache con TTL. Errors se ignoran. */
export async function writeCache(series: SparklineSeries_t): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    // Guardamos con cached=false; al leerlo lo marcamos true en readCache.
    const toStore: SparklineSeries_t = { ...series, cached: false };
    await redis.set(cacheKey(series.symbol, series.range), toStore, { ex: TTL_SECONDS });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sparkline-cache] write failed:', err instanceof Error ? err.message : err);
  }
}
