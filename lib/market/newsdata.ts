/**
 * newsdata.io — noticias de crypto POR-MONEDA para A1.
 *
 * Reemplaza a CryptoPanic. Finnhub /company-news no cubre crypto; newsdata.io
 * tiene un endpoint dedicado `/crypto` que filtra por moneda (?coin=btc). Las
 * noticias entran en el MISMO array `snapshot.news` que A1 ya consume → sin
 * cambios en el prompt de noticias.
 *
 * Auth por query `apikey` (env `NEWSDATA_API_KEY`). Sin key → [] (degradación
 * elegante, igual que Finnhub sin key). `pubDate` viene "YYYY-MM-DD HH:mm:ss" en
 * UTC (campo `pubDateTZ: UTC`), así que lo forzamos a ISO-Z para parsear bien.
 */

import { cryptoMeta } from '@/lib/market/crypto-registry';
import type { MarketNewsItem } from '@/agents/shared/types';

const NEWSDATA_BASE = 'https://newsdata.io/api/1/crypto';
const FETCH_TIMEOUT_MS = 5000;

/** Artículo (parcial) de newsdata.io. Solo lo que consumimos. */
interface NewsdataArticle {
  title?: string;
  link?: string;
  source_name?: string;
  source_id?: string;
  pubDate?: string; // "2026-06-22 02:41:44" (UTC)
}

/**
 * Normaliza un artículo a MarketNewsItem. Puro (recibe `nowMs` para testear el
 * cálculo de age sin Date.now()). Devuelve null si el artículo no tiene título.
 */
export function normalizeNewsdataArticle(a: NewsdataArticle, nowMs: number): MarketNewsItem | null {
  if (!a.title) return null;
  // pubDate es UTC con espacio en vez de 'T' y sin zona: lo forzamos a ISO-Z.
  const iso = a.pubDate ? `${a.pubDate.replace(' ', 'T')}Z` : '';
  const ts = iso ? Date.parse(iso) : NaN;
  const valid = Number.isFinite(ts);
  return {
    headline: a.title,
    source: a.source_name ?? a.source_id ?? 'newsdata.io',
    url: a.link,
    publishedAt: valid ? ts : undefined,
    published_iso: valid ? new Date(ts).toISOString() : null,
    age_hours: valid ? Math.round((nowMs - ts) / 3_600_000) : null,
  };
}

/**
 * Noticias crypto por-moneda vía newsdata.io. [] si no es crypto, no hay key, la
 * red falla, o no hay resultados.
 */
export async function fetchCryptoNews(ticker: string, limit = 5): Promise<MarketNewsItem[]> {
  const meta = cryptoMeta(ticker);
  const key = process.env.NEWSDATA_API_KEY;
  if (!meta || !key) return [];
  try {
    const url =
      `${NEWSDATA_BASE}?apikey=${encodeURIComponent(key)}` +
      `&coin=${encodeURIComponent(meta.newsdataCoin)}&language=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: NewsdataArticle[] };
    const articles = Array.isArray(data.results) ? data.results : [];
    const now = Date.now();
    return articles
      .map((a) => normalizeNewsdataArticle(a, now))
      .filter((x): x is MarketNewsItem => x !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}
