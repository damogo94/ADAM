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
 * Quote vía Yahoo — usado como PRIMARY para que el precio coincida con
 * Investing/TradingView (ambos sirven realtime de proveedores similares).
 *
 * Estrategia: pedimos 1d/1m → la última vela tiene el precio realtime
 * exacto (no el delayed 15min de AV). Si no hay velas intradía hoy
 * (mercado cerrado, ticker no listado), caemos a meta.regularMarketPrice
 * que sigue siendo más fresco que AV.
 */
export async function yahooQuote(symbol: string): Promise<{
  current: number;
  previous_close: number;
  change_pct_24h: number;
  volume: number;
  latest_day: string;
  currency: string;
} | null> {
  const sym = normalizeYahooSymbol(symbol);
  // 1d/1m da el LAST trade tick → matches TradingView/Investing realtime
  const data = await yahooChart(sym, '1d', '1m');
  const result = data?.chart.result?.[0];
  if (!result || !result.meta) return null;
  const m = result.meta;
  const prev = m.previousClose ?? m.chartPreviousClose;

  // Última vela 1m con close válido = precio más reciente
  const candles = parseYahooCandles(data);
  const lastTick = candles.length > 0 ? candles[candles.length - 1]!.c : m.regularMarketPrice;
  const current = lastTick ?? m.regularMarketPrice;
  if (!current) return null;

  const change = prev ? ((current - prev) / prev) * 100 : 0;
  return {
    current,
    previous_close: prev,
    change_pct_24h: change,
    volume: 0,
    latest_day: new Date().toISOString().slice(0, 10),
    currency: m.currency || 'USD',
  };
}

/**
 * Normalizar símbolos para Yahoo:
 *   BTC      → BTC-USD     (cripto)
 *   ETH      → ETH-USD
 *   EUR/USD  → EURUSD=X    (forex)
 *   EUR-USD  → EURUSD=X
 *   AAPL     → AAPL        (no cambia)
 *   IBE.MC   → IBE.MC      (no cambia — Yahoo usa el mismo formato MIC)
 */
function normalizeYahooSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  // Cripto symbol-only (sin sufijo) — añade -USD
  const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'BNB', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'LTC', 'ATOM', 'XLM']);
  if (CRYPTO.has(s)) return `${s}-USD`;
  // Forex EUR/USD → EURUSD=X
  if (s.includes('/')) {
    const [base, quote] = s.split('/');
    if (base && quote && /^[A-Z]{3}$/.test(base) && /^[A-Z]{3}$/.test(quote)) {
      return `${base}${quote}=X`;
    }
  }
  // Forex EUR-USD también (no cripto): si es par de 3 letras-3 letras y no en CRYPTO
  if (/^[A-Z]{3}-[A-Z]{3}$/.test(s) && !CRYPTO.has(s.split('-')[0]!)) {
    return s.replace('-', '') + '=X';
  }
  return s;
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
  const data = await yahooChart(normalizeYahooSymbol(symbol), range, '1d');
  if (!data) return [];
  return parseYahooCandles(data);
}

/** OHLCV intradía — interval 60m, range 5 días. */
export async function yahooIntraday(symbol: string): Promise<NormalizedCandle[]> {
  const data = await yahooChart(normalizeYahooSymbol(symbol), '5d', '60m');
  if (!data) return [];
  return parseYahooCandles(data);
}

// ─── Orchestration helpers ──────────────────────────────────────────────────

/**
 * Quote PRIMARY: Yahoo first (matches Investing/TradingView realtime),
 * Finnhub second (US equities sólo). AV se usa después como fallback en
 * los routes que consumen este helper.
 *
 * Por qué Yahoo first: AV free tier sirve precios con delay 15-20min y
 * gasta cuota (25/día total). Yahoo `/v8/finance/chart` es realtime, sin
 * key, sin cuota práctica. El precio resultante coincide con Investing
 * y TradingView (mismos feeds consolidados).
 */
export async function fallbackQuote(symbol: string): Promise<{
  current: number;
  previous_close: number;
  change_pct_24h: number;
  volume: number;
  latest_day: string;
  currency?: string;
} | null> {
  const yh = await yahooQuote(symbol);
  if (yh) return yh;
  const fh = await finnhubQuote(symbol);
  if (fh) return fh;
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
