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
  type NormalizedCandle,
} from '@/lib/market/finnhub';
import { getMacroSnapshot } from '@/lib/market/macro';
import { coingeckoId, fetchCryptoMarketData } from '@/lib/market/coingecko';
import { fetchCryptoNews } from '@/lib/market/cryptopanic';
import type { MarketSnapshot } from '@/agents/shared/types';

const DAY_S = 86_400; // segundos en un día (los timestamps de las velas van en segundos)
const PCT7D_TOLERANCE_S = 2 * DAY_S; // máx distancia al objetivo de 7d antes de rendirse

/**
 * Variación % a 7 días, calculada POR TIMESTAMP desde las velas diarias.
 *
 * Busca el cierre más cercano a `(última vela − 7 días)` en lugar de "7 velas
 * atrás": cripto cotiza 7d/semana y equity ~5d/semana, así que contar velas
 * daría ventanas temporales distintas según el activo. Por timestamp, la lógica
 * es idéntica para ambos.
 *
 * Devuelve `null` (dato desconocido, NO 0) cuando no es fiable: sin velas, sin
 * precio actual, la vela más cercana queda a >2 días del objetivo (histórico de
 * menos de ~1 semana), o el cierre de referencia es 0. Devolver null —en vez del
 * 0 que se hardcodeaba— evita que A1 narre una señal fantasma de "consolidación".
 */
export function pct7d(daily: NormalizedCandle[], currentPrice: number | null): number | null {
  if (currentPrice === null || daily.length === 0) return null;
  const last = daily[daily.length - 1];
  if (!last) return null;

  const target = last.t - 7 * DAY_S;
  let ref = daily[0]!;
  let bestDist = Math.abs(ref.t - target);
  for (const c of daily) {
    const d = Math.abs(c.t - target);
    if (d < bestDist) {
      bestDist = d;
      ref = c;
    }
  }

  // Histórico insuficiente: ni siquiera hay una vela razonablemente cerca del
  // punto de hace 7 días.
  if (bestDist > PCT7D_TOLERANCE_S) return null;
  if (ref.c === 0) return null;

  return ((currentPrice - ref.c) / ref.c) * 100;
}

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
  // CoinGecko SOLO si el ticker es crypto conocido (coingeckoId != null); para
  // el resto, Finnhub cubre fundamentals. Sin esto A1 quedaba mudo en crypto
  // (Finnhub free no cubre crypto).
  const isCrypto = coingeckoId(ticker) !== null;
  const [q, daily, intraday, ov, news, macro, crypto, cryptoNews] = await Promise.all([
    fallbackQuote(ticker).catch(() => null),
    // '1y' (~252 velas), NO el default '3mo' (~63): A3 corre SMA200 y
    // golden/death cross sobre estas velas vía computeTechnical, y ambos
    // exigen ≥200/≥205 velas. Con '3mo' SMA200 era siempre null y los cruces
    // nunca disparaban en prod. Iguala lo que ya usan cmt/scan y estructura.
    fallbackDaily(ticker, '1y').catch(() => []),
    fallbackIntraday(ticker).catch(() => []),
    fallbackOverview(ticker).catch(() => null),
    fallbackNewsSentiment(ticker, 5).catch(() => []),
    getMacroSnapshot().catch(() => null),
    // CoinGecko (fundamentals) + CryptoPanic (noticias) SOLO si es crypto conocido.
    isCrypto ? fetchCryptoMarketData(ticker).catch(() => null) : Promise.resolve(null),
    isCrypto ? fetchCryptoNews(ticker, 5).catch(() => []) : Promise.resolve([]),
  ]);

  // Recovery: si el quote falla, derivamos precio/variación de las 2 últimas velas.
  let currentPrice = q?.current ?? null;
  // NOTA: este `?? 0` tiene el mismo anti-patrón latente que el viejo
  // change_pct_7d (un valor desconocido se representa como 0 = "sin cambio").
  // Menor prioridad: el 24h sí viene del quote casi siempre. Fuera de alcance aquí.
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
      // Calculado por timestamp desde las velas diarias; null = histórico
      // insuficiente (A1 lo trata como "desconocido", no como consolidación).
      change_pct_7d: pct7d(daily, currentPrice),
      currency: ov?.currency ?? (q && 'currency' in q ? q.currency : 'USD') ?? 'USD',
    },
    fundamentals: {
      per: ov?.per ?? null,
      peg: ov?.peg ?? null,
      ev_ebitda: ov?.ev_ebitda ?? null,
      fcf_yield_pct: null, // Finnhub free no expone FCF yield
      dividend_yield_pct: ov?.dividend_yield_pct ?? null,
      // En crypto, Finnhub da null → lo rellena CoinGecko.
      market_cap_usd: ov?.market_cap_usd ?? crypto?.market_cap_usd ?? null,
    },
    // Fundamentals crypto (CoinGecko) — null para no-crypto. A1 lo usa como lente.
    crypto: crypto ?? null,
    // En crypto, Finnhub /company-news da [] → usamos CryptoPanic. Mutuamente
    // excluyentes en la práctica (equity: cryptoNews=[]; crypto: news=[]).
    news: [...news, ...cryptoNews],
    // Cap a 300 (no 100): el compute de A3 necesita ≥205 velas para SMA200 +
    // golden/death cross. '1y' devuelve ~252, que pasan enteras; 300 es solo
    // un techo defensivo. Bajar este cap por debajo de 205 revive el bug.
    // A1/A2 NO reciben ohlcv (ver a1/a2 narrate), así que ensanchar no les
    // sube tokens; el LLM de A3 recibe computeOut, no las velas.
    ohlcv_daily: daily.slice(-300),
    ohlcv_intraday: intraday.slice(-100),
    macro_snapshot: macro ? { ...macro } : {},
  };

  return { ok: true, data: { snapshot, currentPrice } };
}
