/**
 * CryptoPanic — noticias de crypto POR-MONEDA para A1 (v2).
 *
 * Complementa a CoinGecko (que da fundamentals crypto): A1 es un agente
 * por-activo y necesita noticias del activo concreto. Finnhub /company-news no
 * cubre crypto; CryptoPanic filtra por moneda (BTC/ETH/…).
 *
 * Free tier: REQUIERE auth token (env `CRYPTOPANIC_API_KEY`). Sin token →
 * devuelve [] (degradación elegante, igual que Finnhub sin key). Las noticias
 * entran en el MISMO array `news` del snapshot que A1 ya consume → sin cambios
 * de prompt.
 */

import { coingeckoId } from '@/lib/market/coingecko';
import type { MarketNewsItem } from '@/agents/shared/types';

const CRYPTOPANIC_BASE = 'https://cryptopanic.com/api/v1';
const FETCH_TIMEOUT_MS = 6000;

/**
 * Símbolo de moneda CryptoPanic para un ticker, o null si no es crypto conocido.
 * Reusa el set de crypto del catálogo vía `coingeckoId` (mismas 13 monedas); el
 * símbolo CryptoPanic ES el ticker base (BTC, ETH…). Tolera el sufijo -USD.
 */
export function cryptoPanicCurrency(ticker: string): string | null {
  const base = ticker.trim().toUpperCase().replace(/-USD$/, '');
  return coingeckoId(base) ? base : null;
}

/** Forma (parcial) de un post de CryptoPanic. Solo lo que consumimos. */
interface CryptoPanicPost {
  title?: string;
  url?: string;
  published_at?: string;
  source?: { title?: string; domain?: string };
}

/**
 * Normaliza un post a MarketNewsItem. Puro (recibe `nowMs` para testear el
 * cálculo de age sin Date.now()). Devuelve null si el post no tiene título.
 */
export function normalizeCryptoPanicPost(p: CryptoPanicPost, nowMs: number): MarketNewsItem | null {
  if (!p.title) return null;
  const publishedAt = p.published_at ? Date.parse(p.published_at) : NaN;
  const valid = Number.isFinite(publishedAt);
  return {
    headline: p.title,
    source: p.source?.title ?? p.source?.domain ?? 'CryptoPanic',
    url: p.url,
    publishedAt: valid ? publishedAt : undefined,
    published_iso: valid ? new Date(publishedAt).toISOString() : null,
    age_hours: valid ? Math.round((nowMs - publishedAt) / 3_600_000) : null,
  };
}

/**
 * Noticias crypto por-moneda. [] si no es crypto, no hay token, la red falla,
 * o CryptoPanic no devuelve resultados.
 */
export async function fetchCryptoNews(ticker: string, limit = 5): Promise<MarketNewsItem[]> {
  const currency = cryptoPanicCurrency(ticker);
  const token = process.env.CRYPTOPANIC_API_KEY;
  if (!currency || !token) return [];
  try {
    const url =
      `${CRYPTOPANIC_BASE}/posts/?auth_token=${encodeURIComponent(token)}` +
      `&currencies=${currency}&kind=news&public=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: CryptoPanicPost[] };
    const posts = Array.isArray(data.results) ? data.results : [];
    const now = Date.now();
    return posts
      .map((p) => normalizeCryptoPanicPost(p, now))
      .filter((x): x is MarketNewsItem => x !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}
