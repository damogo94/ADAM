/**
 * Constructor único del MarketSnapshot que alimenta al pipeline.
 *
 * Antes este bloque (fan-out de datos + recovery de precio + ensamblado del
 * snapshot) estaba duplicado en `/api/agents/run` y en `lib/pipeline-runner`.
 * Cualquier divergencia entre ambos producía análisis distintos para el mismo
 * ticker según el caller. Centralizado aquí: una sola fuente de verdad.
 *
 * Todas las llamadas a providers son resilientes (.catch → null/[]). Si no hay
 * ni quote ni velas diarias, no hay nada que analizar → `ok: false`.
 */

import 'server-only';
import {
  fallbackQuote,
  fallbackDaily,
  fallbackIntraday,
  fallbackOverview,
  fallbackNewsSentiment,
} from '@/lib/market/finnhub';
import { getMacroSnapshot } from '@/lib/market/macro';
import type { MarketSnapshot } from '@/agents/shared/types';

export interface BuiltSnapshot {
  snapshot: MarketSnapshot;
  /**
   * Precio actual crudo usado para persistir `initial_price`. Puede ser null
   * (p.ej. 1 sola vela y quote caído) aunque el snapshot sea utilizable.
   * `snapshot.quote.current` ya lleva el fallback a 0.
   */
  currentPrice: number | null;
}

export type SnapshotResult =
  | { ok: true; data: BuiltSnapshot }
  | { ok: false; reason: 'market_data_unavailable' };

/**
 * Fetch resiliente de todos los datos de mercado + ensamblado del snapshot.
 * El `ticker` debe venir ya normalizado (mayúsculas) por el caller.
 */
export async function buildMarketSnapshot(ticker: string): Promise<SnapshotResult> {
  // Fan-out paralelo — cada provider es best-effort.
  const [q, daily, intraday, ov, news, macro] = await Promise.all([
    fallbackQuote(ticker).catch(() => null),
    fallbackDaily(ticker).catch(() => []),
    fallbackIntraday(ticker).catch(() => []),
    fallbackOverview(ticker).catch(() => null),
    fallbackNewsSentiment(ticker, 5).catch(() => []),
    getMacroSnapshot().catch(() => null),
  ]);

  // Recovery: si el quote falla, derivamos precio/variación de las 2 últimas velas.
  let currentPrice = q?.current ?? null;
  let changePct24h = q?.change_pct_24h ?? 0;
  if (currentPrice === null && daily.length >= 2) {
    const last = daily[daily.length - 1];
    const prev = daily[daily.length - 2];
    if (last && prev) {
      currentPrice = last.c;
      changePct24h = ((last.c - prev.c) / prev.c) * 100;
    }
  }

  // Sin precio Y sin velas → no hay nada que analizar.
  if (currentPrice === null && daily.length === 0) {
    return { ok: false, reason: 'market_data_unavailable' };
  }

  const snapshot: MarketSnapshot = {
    ticker,
    quote: {
      current: currentPrice ?? 0,
      change_pct_24h: changePct24h,
      change_pct_7d: 0,
      currency: ov?.currency ?? (q && 'currency' in q ? q.currency : 'USD') ?? 'USD',
    },
    fundamentals: {
      per: ov?.per ?? null,
      peg: ov?.peg ?? null,
      ev_ebitda: ov?.ev_ebitda ?? null,
      fcf_yield_pct: null, // Finnhub free no expone FCF yield
      dividend_yield_pct: ov?.dividend_yield_pct ?? null,
      market_cap_usd: ov?.market_cap_usd ?? null,
    },
    news,
    ohlcv_daily: daily.slice(-100),
    ohlcv_intraday: intraday.slice(-100),
    macro_snapshot: macro ? { ...macro } : {},
  };

  return { ok: true, data: { snapshot, currentPrice } };
}
