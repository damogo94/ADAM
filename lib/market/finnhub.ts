/**
 * Finnhub + Yahoo — fuente PRINCIPAL de market data (sesión 6d).
 *
 * Alpha Vantage eliminado por:
 *   - Cuota miserable (25 req/día free tier)
 *   - Delay 15-20min en quotes (no coincide con TradingView/Investing)
 *   - Sin endpoint de candles realtime en free
 *
 * Reparto:
 *   - Finnhub /quote          → precio realtime US equities (60/min free)
 *   - Finnhub /stock/profile2 → company profile (name, currency, exchange)
 *   - Finnhub /stock/metric   → fundamentals (P/E, EV/EBITDA, market cap...)
 *   - Finnhub /company-news   → noticias con date range (free, ilimitado)
 *   - Yahoo /v8/finance/chart → OHLCV diario + intraday + quote fallback
 *
 * Para cripto/forex/equities no-US Finnhub no tiene cobertura free → Yahoo
 * cubre todo eso porque sirve precio + candles para cualquier ticker.
 *
 * ⚠️ FINNHUB_API_KEY en env. Sin key → Yahoo cubre quotes+candles, pero NO
 * fundamentals ni news (Yahoo no las expone de forma estable en free).
 * Crea cuenta gratis en https://finnhub.io
 */

export interface NormalizedCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

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

// ─── Finnhub: /stock/profile2 + /stock/metric (fundamentals) ────────────────

interface FinnhubProfile {
  country?: string;
  currency?: string;
  exchange?: string;
  name?: string;
  ticker?: string;
  marketCapitalization?: number; // en millones
  shareOutstanding?: number;
  finnhubIndustry?: string;
}

interface FinnhubMetricResponse {
  metric?: {
    peNormalizedAnnual?: number;
    peExclExtraAnnual?: number;
    peBasicExclExtraTTM?: number;
    pegRatio?: number;
    'enterpriseValueOverEBITDA'?: number;
    'enterpriseValue/ebitdaAnnual'?: number;
    dividendYieldIndicatedAnnual?: number;
    dividendYield5Y?: number;
    beta?: number;
    '52WeekHigh'?: number;
    '52WeekLow'?: number;
    epsTTM?: number;
    [k: string]: number | string | undefined;
  };
  series?: unknown;
}

/**
 * Company profile + métricas fundamentales — reemplaza AV OVERVIEW.
 *
 * Free tier de Finnhub permite estos dos endpoints sin restricciones especiales
 * más allá del 60 req/min global. Combinamos ambos en una sola normalizada
 * compatible con la shape que A1 espera.
 */
export async function finnhubOverview(symbol: string): Promise<{
  name: string;
  currency: string;
  exchange: string;
  sector: string;
  market_cap_usd: number | null;
  per: number | null;
  peg: number | null;
  ev_ebitda: number | null;
  dividend_yield_pct: number | null;
  beta: number | null;
  week52_high: number | null;
  week52_low: number | null;
} | null> {
  const key = finnhubKey();
  if (!key) return null;
  try {
    const [profileRes, metricRes] = await Promise.all([
      fetch(`${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
      fetch(`${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    ]);
    if (!profileRes.ok && !metricRes.ok) return null;
    const profile = (profileRes.ok ? ((await profileRes.json()) as FinnhubProfile) : {}) as FinnhubProfile;
    const metricData = (metricRes.ok ? ((await metricRes.json()) as FinnhubMetricResponse) : { metric: {} }) as FinnhubMetricResponse;
    const m = metricData.metric ?? {};

    // Si profile viene vacío (Finnhub no cubre el ticker) y metric también → null
    if (!profile.name && !profile.currency && Object.keys(m).length === 0) return null;

    const pickNum = (...candidates: (number | string | undefined)[]): number | null => {
      for (const c of candidates) {
        if (typeof c === 'number' && Number.isFinite(c)) return c;
      }
      return null;
    };

    return {
      name: profile.name ?? '',
      currency: profile.currency ?? 'USD',
      exchange: profile.exchange ?? '',
      sector: profile.finnhubIndustry ?? '',
      // Finnhub devuelve marketCap en MILLONES → multiplicar
      market_cap_usd: profile.marketCapitalization ? profile.marketCapitalization * 1_000_000 : null,
      per: pickNum(m.peNormalizedAnnual, m.peExclExtraAnnual, m.peBasicExclExtraTTM),
      peg: pickNum(m.pegRatio),
      ev_ebitda: pickNum(m['enterpriseValueOverEBITDA'], m['enterpriseValue/ebitdaAnnual']),
      dividend_yield_pct: pickNum(m.dividendYieldIndicatedAnnual, m.dividendYield5Y),
      beta: pickNum(m.beta),
      week52_high: pickNum(m['52WeekHigh']),
      week52_low: pickNum(m['52WeekLow']),
    };
  } catch {
    return null;
  }
}

// ─── Finnhub: /company-news ─────────────────────────────────────────────────

interface FinnhubNewsItem {
  category: string;
  datetime: number; // epoch seconds
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

/**
 * Noticias de empresa — reemplaza AV NEWS_SENTIMENT.
 *
 * Finnhub no devuelve sentiment pre-computed. Aplicamos heurística simple
 * basada en keywords del headline. Es burdo pero suficiente para que A1
 * priorice; A1 hace su propio reasoning sobre el contenido.
 *
 * date range: últimas 48h (alineado con la regla de "datos de HOY" de A1).
 */
export async function finnhubNews(symbol: string, limit = 5): Promise<{
  headline: string;
  source: string;
  url: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  publishedAt: number;
  published_iso: string;
  age_hours: number;
}[]> {
  const key = finnhubKey();
  if (!key) return [];
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 48 * 3600 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(now)}&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as FinnhubNewsItem[];
    if (!Array.isArray(data)) return [];
    const nowMs = now.getTime();
    return data
      .filter((n) => n.headline && n.datetime > 0)
      .map((n) => {
        const publishedAt = n.datetime * 1000;
        return {
          headline: n.headline,
          source: n.source ?? 'Finnhub',
          url: n.url ?? '',
          sentiment: classifySentiment(n.headline + ' ' + (n.summary ?? '')),
          publishedAt,
          published_iso: new Date(publishedAt).toISOString(),
          age_hours: Math.round((nowMs - publishedAt) / 3_600_000),
        };
      })
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Antes había aquí una heurística por keywords (~14 palabras bull / 14 bear,
 * contador, umbral en ±2). Falla en titulares financieros realistas:
 *   - "Apple beats estimates but warns on China"  → score 0 (neutral) por
 *     compensación, cuando es claramente mixed con sesgo bearish.
 *   - "Tesla cuts prices to drive growth"          → score 0 (cut -1, growth +1)
 *     cuando es bearish para márgenes.
 *   - "Microsoft strong despite weak quarter"      → score 0, pero la lectura
 *     real depende de a qué se refiere "weak".
 *
 * Además sesgaba el snapshot que recibe A1: si el clasificador decía "bearish"
 * por keywords ruidosas, A1 podía anclar su narrativa a ese tag previo.
 *
 * Decisión: devolver 'neutral' siempre. A1 (Sonnet) clasifica mucho mejor
 * leyendo headline+summary completo. Si en el futuro queremos sentiment
 * estructurado pre-A1, debe venir de una fuente real (Perplexity, modelo
 * dedicado, o servicio de sentiment financiero), no de regex.
 */
function classifySentiment(_text: string): 'bullish' | 'bearish' | 'neutral' {
  return 'neutral';
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
 * Daily candles. Yahoo /v8/chart 3mo/1d — sin auth, sin cuota práctica.
 */
export async function fallbackDaily(symbol: string): Promise<NormalizedCandle[]> {
  return yahooDaily(symbol, '3mo');
}

/** Intraday 60min candles. Yahoo /v8/chart 5d/60m. */
export async function fallbackIntraday(symbol: string): Promise<NormalizedCandle[]> {
  return yahooIntraday(symbol);
}

/**
 * Company fundamentals — solo Finnhub. Si no hay FINNHUB_API_KEY o el
 * ticker no tiene cobertura free, devuelve null. A1 degrada el análisis
 * cuando viene null (no inventa datos).
 */
export async function fallbackOverview(symbol: string) {
  return finnhubOverview(symbol);
}

/**
 * Noticias últimas 48h — solo Finnhub. Si no hay key, devuelve [].
 * A1 puede seguir analizando sin noticias (solo price action + macro).
 */
export async function fallbackNewsSentiment(symbol: string, limit = 5) {
  return finnhubNews(symbol, limit);
}
