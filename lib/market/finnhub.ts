/**
 * Finnhub + Yahoo fallback — segundo proveedor de market data.
 *
 * Por qué este módulo existe:
 *   Alpha Vantage free tier = 25 req/día. Con 5 endpoints por análisis,
 *   eso son 5 análisis/día antes de quedarnos sin cuota. Cuando AV soft-errea
 *   (circuit breaker abierto), este módulo sirve de failover automático.
 *
 * Reparto de responsabilidades:
 *   - Finnhub `/quote` → precio realtime (free tier: 60 req/min, US equities)
 *   - Yahoo Finance `/v8/finance/chart` → OHLCV diario + intraday (sin auth)
 *     Es la API no-oficial que toda la web usa. Sin contrato formal pero
 *     hyper-estable en práctica (~10 años).
 *
 * Si Finnhub no tiene el ticker (cripto, forex internacional, derivados),
 * caemos a Yahoo también para el quote.
 *
 * ⚠️ Requiere FINNHUB_API_KEY en env. Si no está, las llamadas al quote
 * caen directamente a Yahoo. Crea cuenta gratis en https://finnhub.io
 */

import type { NormalizedCandle } from './alphavantage';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const FETCH_TIMEOUT_MS = 6000;

function finnhubKey(): string | null {
  return process.env.FINNHUB_API_KEY || null;
}

// ─── Finnhub: /quote ────────────────────────────────────────────────────────

interface FinnhubQuote {
  c: number; // current price
  d: number | null; // change
  dp: number | null; // change %
  h: number; // high today
  l: number; // low today
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp
}

export async function finnhubQuote(symbol: string): Promise<{
  current: number;
  previous_close: number;
  change_pct_24h: number;
  volume: number;
  latest_day: string;
} | null> {
  const key = finnhubKey();
  if (!key) return null;
  try {
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as FinnhubQuote;
    // Finnhub devuelve {c:0, d:null...} cuando no encuentra el ticker
    if (!data || data.c === 0 || data.c === null || data.c === undefined) return null;
    return {
      current: data.c,
      previous_close: data.pc,
      change_pct_24h: data.dp ?? 0,
      volume: 0, // Finnhub /quote no incluye volumen — separate endpoint
      latest_day: new Date((data.t || Date.now() / 1000) * 1000).toISOString().slice(0, 10),
    };
  } catch {
    return null;
  }
}

// ─── Yahoo: /v8/finance/chart ───────────────────────────────────────────────
//
// Endpoint no oficial pero estable. Se usa para:
//   - Quote como fallback de Finnhub (cuando el ticker no está en Finnhub free)
//   - Candles diarios + intraday (Finnhub free ya no permite candles)

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose: number;
        chartPreviousClose: number;
        currency: string;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

async function yahooChart(
  symbol: string,
  range: string,
  interval: string
): Promise<YahooChartResponse | null> {
  try {
    // User-Agent header — Yahoo bloquea peticiones sin UA "humano"
    const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ADAM/1.0)',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as YahooChartResponse;
    if (data.chart.error || !data.chart.result?.[0]) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Quote vía Yahoo — fallback del fallback. Usa el meta del chart endpoint
 * (más confiable que el endpoint /v7/finance/quote que cambia de forma).
 */
export async function yahooQuote(symbol: string): Promise<{
  current: number;
  previous_close: number;
  change_pct_24h: number;
  volume: number;
  latest_day: string;
  currency: string;
} | null> {
  const data = await yahooChart(symbol, '5d', '1d');
  const result = data?.chart.result?.[0];
  if (!result) return null;
  const m = result.meta;
  const change = m.previousClose ? ((m.regularMarketPrice - m.previousClose) / m.previousClose) * 100 : 0;
  return {
    current: m.regularMarketPrice,
    previous_close: m.previousClose,
    change_pct_24h: change,
    volume: 0,
    latest_day: new Date().toISOString().slice(0, 10),
    currency: m.currency || 'USD',
  };
}

function parseYahooCandles(data: YahooChartResponse): NormalizedCandle[] {
  const r = data.chart.result?.[0];
  if (!r) return [];
  const q = r.indicators.quote?.[0];
  if (!q) return [];
  const out: NormalizedCandle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i];
    const h = q.high[i];
    const l = q.low[i];
    const c = q.close[i];
    const v = q.volume[i];
    // Yahoo a veces tiene nulls/undefined en bars sin trades (gaps); skipeamos
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      t: r.timestamp[i]!,
      o,
      h,
      l,
      c,
      v: v ?? 0,
    });
  }
  return out;
}

/** OHLCV diario — últimos N días. Range '3mo' ≈ 60 candles. */
export async function yahooDaily(symbol: string, range = '3mo'): Promise<NormalizedCandle[]> {
  const data = await yahooChart(symbol, range, '1d');
  if (!data) return [];
  return parseYahooCandles(data);
}

/** OHLCV intradía — interval 60m, range 5 días. */
export async function yahooIntraday(symbol: string): Promise<NormalizedCandle[]> {
  const data = await yahooChart(symbol, '5d', '60m');
  if (!data) return [];
  return parseYahooCandles(data);
}

// ─── Orchestration helpers ──────────────────────────────────────────────────

/**
 * Quote con cascada: Finnhub → Yahoo → null.
 * Devuelve null si ambos fallan. Caller decide qué hacer (probablemente
 * caer al último daily close del candle response, como hace alphavantage).
 */
export async function fallbackQuote(symbol: string): Promise<{
  current: number;
  previous_close: number;
  change_pct_24h: number;
  volume: number;
  latest_day: string;
  currency?: string;
} | null> {
  const fh = await finnhubQuote(symbol);
  if (fh) return fh;
  const yh = await yahooQuote(symbol);
  if (yh) return yh;
  return null;
}

/**
 * Daily candles con fallback. Yahoo es el único free-tier confiable para
 * candles hoy (Finnhub free ya no incluye /stock/candle).
 */
export async function fallbackDaily(symbol: string): Promise<NormalizedCandle[]> {
  return yahooDaily(symbol, '3mo');
}

/** Intraday 60min candles. */
export async function fallbackIntraday(symbol: string): Promise<NormalizedCandle[]> {
  return yahooIntraday(symbol);
}
