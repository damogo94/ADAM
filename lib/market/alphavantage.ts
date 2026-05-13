/**
 * Alpha Vantage client — market data for A.D.A.M.
 *
 * Free tier: 25 requests/day, 5/minute. AGGRESSIVE caching is mandatory.
 * Docs: https://www.alphavantage.co/documentation/
 *
 * One full A4 orchestration call = 5 endpoints:
 *   GLOBAL_QUOTE + OVERVIEW + NEWS_SENTIMENT + TIME_SERIES_DAILY + TIME_SERIES_INTRADAY
 * That's 5/25 daily quota → caché agresivo en Upstash es crítico.
 */

import { getRedisClient } from '@/lib/ratelimit';

const BASE = 'https://www.alphavantage.co/query';
const FETCH_TIMEOUT_MS = 8000; // hard timeout — un AV colgado NO bloquea el lambda
const CIRCUIT_BREAKER_MS = 60_000; // si AV soft-error, no le pegamos durante 60s
const MAX_STALE_MS = 24 * 60 * 60 * 1000; // 24h max stale válido

function key(): string {
  const k = process.env.ALPHA_VANTAGE_API_KEY;
  if (!k) throw new Error('[A.D.A.M.] ALPHA_VANTAGE_API_KEY not set');
  return k;
}

/**
 * Cache de 2 capas:
 *   L1 = Map en memoria (proceso/lambda warm) — instantáneo
 *   L2 = Upstash Redis (compartido entre instancias) — sobrevive cold starts y multi-user
 *
 * Circuit breaker module-level: si AV devuelve soft-error (Note/Information),
 * marcamos `avThrottledUntil` y durante CIRCUIT_BREAKER_MS NO le pegamos más.
 * Las llamadas durante ese periodo van directo a L1/L2 stale o devuelven null.
 */
interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  storedAt: number;
}
const memoryCache = new Map<string, CacheEntry>();
let avThrottledUntil = 0; // unix ms — hasta cuándo NO pegamos a AV

const L2_PREFIX = 'adam:av:';

function cacheKey(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

async function readL2<T>(ck: string): Promise<CacheEntry<T> | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    return (await redis.get<CacheEntry<T>>(L2_PREFIX + ck)) ?? null;
  } catch {
    return null;
  }
}

async function writeL2<T>(ck: string, entry: CacheEntry<T>, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    // Guardamos con TTL = MAX_STALE_MS para poder servir stale mientras dure
    await redis.set(L2_PREFIX + ck, entry, { ex: Math.max(ttlSeconds, MAX_STALE_MS / 1000) });
  } catch {
    /* swallow — cache es best-effort */
  }
}

async function fetchJson<T>(
  params: Record<string, string>,
  revalidateSeconds: number
): Promise<T> {
  const ck = cacheKey(params);
  const now = Date.now();

  // 1. L1 hit fresco
  const l1 = memoryCache.get(ck) as CacheEntry<T> | undefined;
  if (l1 && l1.expiresAt > now) return l1.data;

  // 2. L2 hit fresco — promueve a L1
  const l2 = await readL2<T>(ck);
  if (l2 && l2.expiresAt > now) {
    memoryCache.set(ck, l2);
    return l2.data;
  }

  // 3. Circuit breaker — si AV throttled, no llamamos. Devolvemos stale L1 o L2 si hay.
  if (now < avThrottledUntil) {
    const stale = l1 ?? l2;
    if (stale && now - stale.storedAt < MAX_STALE_MS) {
      memoryCache.set(ck, stale);
      // eslint-disable-next-line no-console
      console.warn(
        `[AV] circuit-breaker ON (${Math.ceil((avThrottledUntil - now) / 1000)}s left), serving stale for ${params.function}/${params.symbol ?? '?'}`
      );
      return stale.data;
    }
    throw new Error('AlphaVantage rate-limited (circuit breaker open) — no stale cache disponible');
  }

  // 4. Fetch con timeout duro
  const url = new URL(BASE);
  Object.entries({ ...params, apikey: key() }).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: revalidateSeconds },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`AlphaVantage ${params.function} failed: ${res.status}`);
    const data = (await res.json()) as Record<string, unknown> & T;

    // AV soft-errors → activa circuit breaker
    if (typeof data === 'object' && data !== null) {
      const note = (data as { Note?: string; Information?: string }).Note;
      const info = (data as { Information?: string }).Information;
      if (note || info) {
        avThrottledUntil = now + CIRCUIT_BREAKER_MS;
        const stale = l1 ?? l2;
        if (stale && now - stale.storedAt < MAX_STALE_MS) {
          memoryCache.set(ck, stale);
          // eslint-disable-next-line no-console
          console.warn(
            `[AV] soft-error → breaker ON 60s, serving stale for ${params.function}/${params.symbol ?? '?'} (age ${Math.floor((now - stale.storedAt) / 1000)}s)`
          );
          return stale.data;
        }
        throw new Error(`AlphaVantage soft error: ${note ?? info}`);
      }
    }

    // 5. Store en L1 + L2
    const entry: CacheEntry<T> = {
      data,
      expiresAt: now + revalidateSeconds * 1000,
      storedAt: now,
    };
    memoryCache.set(ck, entry);
    void writeL2(ck, entry, revalidateSeconds);
    return data;
  } catch (err) {
    // Timeout o network error — fallback a stale si lo hay
    const stale = l1 ?? l2;
    if (stale && now - stale.storedAt < MAX_STALE_MS) {
      memoryCache.set(ck, stale);
      // eslint-disable-next-line no-console
      console.warn(
        `[AV] fetch failed, serving stale for ${params.function}/${params.symbol ?? '?'}: ${err instanceof Error ? err.message : 'unknown'}`
      );
      return stale.data;
    }
    throw err;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AVGlobalQuote {
  'Global Quote': {
    '01. symbol': string;
    '02. open': string;
    '03. high': string;
    '04. low': string;
    '05. price': string;
    '06. volume': string;
    '07. latest trading day': string;
    '08. previous close': string;
    '09. change': string;
    '10. change percent': string;
  };
}

export interface AVOverview {
  Symbol: string;
  Name: string;
  Currency: string;
  Exchange: string;
  Sector: string;
  Industry: string;
  MarketCapitalization: string;
  PERatio: string;
  PEGRatio: string;
  EVToEBITDA: string;
  DividendYield: string;
  Beta: string;
  '52WeekHigh': string;
  '52WeekLow': string;
}

export interface AVNewsItem {
  title: string;
  url: string;
  time_published: string;
  source: string;
  summary: string;
  overall_sentiment_label: 'Bearish' | 'Somewhat-Bearish' | 'Neutral' | 'Somewhat-Bullish' | 'Bullish';
  overall_sentiment_score: number;
  ticker_sentiment?: { ticker: string; relevance_score: string; ticker_sentiment_label: string }[];
}

export interface AVNewsSentiment {
  feed: AVNewsItem[];
  items: string;
  sentiment_score_definition: string;
}

export interface AVDailyTimeSeries {
  'Meta Data': Record<string, string>;
  'Time Series (Daily)': Record<
    string,
    { '1. open': string; '2. high': string; '3. low': string; '4. close': string; '5. volume': string }
  >;
}

export interface AVIntradayTimeSeries {
  'Meta Data': Record<string, string>;
  [key: `Time Series (${string})`]: Record<
    string,
    { '1. open': string; '2. high': string; '3. low': string; '4. close': string; '5. volume': string }
  >;
}

export interface NormalizedCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

/** Quote — 30s cache. */
export function quote(symbol: string) {
  return fetchJson<AVGlobalQuote>({ function: 'GLOBAL_QUOTE', symbol }, 30);
}

/** Company fundamentals — 24h cache. */
export function overview(symbol: string) {
  return fetchJson<AVOverview>({ function: 'OVERVIEW', symbol }, 60 * 60 * 24);
}

/** News + AV-pre-computed sentiment — 5min cache. */
export function newsSentiment(symbol: string, limit = 10) {
  return fetchJson<AVNewsSentiment>(
    { function: 'NEWS_SENTIMENT', tickers: symbol, limit: String(limit), sort: 'LATEST' },
    300
  );
}

/** Daily OHLCV (compact = last 100 days) — 5min intraday, 24h after close. */
export function timeSeriesDaily(symbol: string) {
  return fetchJson<AVDailyTimeSeries>(
    { function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' },
    300
  );
}

/** Intraday OHLCV — 60min interval. */
export function timeSeriesIntraday(symbol: string, interval: '5min' | '15min' | '30min' | '60min' = '60min') {
  return fetchJson<AVIntradayTimeSeries>(
    { function: 'TIME_SERIES_INTRADAY', symbol, interval, outputsize: 'compact' },
    180
  );
}

// ─── Normalizers ────────────────────────────────────────────────────────────

export function normalizeQuote(q: AVGlobalQuote) {
  const g = q['Global Quote'];
  if (!g || !g['05. price']) return null;
  const price = parseFloat(g['05. price']);
  const prevClose = parseFloat(g['08. previous close']);
  const changePct = parseFloat((g['10. change percent'] ?? '0').replace('%', ''));
  return {
    current: price,
    previous_close: prevClose,
    change_pct_24h: changePct,
    volume: parseInt(g['06. volume'] ?? '0', 10),
    latest_day: g['07. latest trading day'],
  };
}

export function normalizeOverview(o: AVOverview) {
  const num = (s: string | undefined) => {
    if (!s || s === 'None' || s === '-') return null;
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  };
  return {
    name: o.Name,
    currency: o.Currency,
    exchange: o.Exchange,
    sector: o.Sector,
    market_cap_usd: num(o.MarketCapitalization),
    per: num(o.PERatio),
    peg: num(o.PEGRatio),
    ev_ebitda: num(o.EVToEBITDA),
    dividend_yield_pct: num(o.DividendYield) !== null ? (num(o.DividendYield) as number) * 100 : null,
    beta: num(o.Beta),
    week52_high: num(o['52WeekHigh']),
    week52_low: num(o['52WeekLow']),
  };
}

const SENTIMENT_MAP: Record<AVNewsItem['overall_sentiment_label'], 'bullish' | 'bearish' | 'neutral'> = {
  Bullish: 'bullish',
  'Somewhat-Bullish': 'bullish',
  Neutral: 'neutral',
  'Somewhat-Bearish': 'bearish',
  Bearish: 'bearish',
};

export function normalizeNews(news: AVNewsSentiment, max = 5) {
  return news.feed.slice(0, max).map((n) => ({
    headline: n.title,
    source: n.source,
    url: n.url,
    sentiment: SENTIMENT_MAP[n.overall_sentiment_label] ?? 'neutral',
  }));
}

function parseSeries(
  series: Record<string, { '1. open': string; '2. high': string; '3. low': string; '4. close': string; '5. volume': string }>
): NormalizedCandle[] {
  return Object.entries(series)
    .map(([date, ohlc]) => ({
      t: Math.floor(new Date(date).getTime() / 1000),
      o: parseFloat(ohlc['1. open']),
      h: parseFloat(ohlc['2. high']),
      l: parseFloat(ohlc['3. low']),
      c: parseFloat(ohlc['4. close']),
      v: parseInt(ohlc['5. volume'] ?? '0', 10),
    }))
    .sort((a, b) => a.t - b.t);
}

export function normalizeDaily(d: AVDailyTimeSeries): NormalizedCandle[] {
  const series = d['Time Series (Daily)'];
  if (!series) return [];
  return parseSeries(series);
}

export function normalizeIntraday(d: AVIntradayTimeSeries, interval = '60min'): NormalizedCandle[] {
  const key = `Time Series (${interval})` as const;
  const series = d[key];
  if (!series) return [];
  return parseSeries(series);
}
