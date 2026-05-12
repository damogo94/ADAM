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

const BASE = 'https://www.alphavantage.co/query';

function key(): string {
  const k = process.env.ALPHA_VANTAGE_API_KEY;
  if (!k) throw new Error('[A.D.A.M.] ALPHA_VANTAGE_API_KEY not set');
  return k;
}

async function fetchJson<T>(params: Record<string, string>, revalidateSeconds: number): Promise<T> {
  const url = new URL(BASE);
  Object.entries({ ...params, apikey: key() }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { next: { revalidate: revalidateSeconds } });
  if (!res.ok) throw new Error(`AlphaVantage ${params.function} failed: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown> & T;

  // AV soft-errors are 200 OK with body { "Note": "...rate limited..." } or { "Information": "..." }
  if (typeof data === 'object' && data !== null) {
    const note = (data as { Note?: string; Information?: string }).Note;
    const info = (data as { Information?: string }).Information;
    if (note || info) throw new Error(`AlphaVantage soft error: ${note ?? info}`);
  }
  return data as T;
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
