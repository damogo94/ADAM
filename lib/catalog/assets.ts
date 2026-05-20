/**
 * Catálogo curado de activos populares para el AssetPicker.
 *
 * Decisiones:
 *  - Tickers son los CANÓNICOS que el normalizador de `lib/market/finnhub.ts`
 *    ya acepta (BTC, EUR/USD, AAPL…). No metemos ^GSPC / CL=F porque
 *    introducen casos especiales en el pipeline.
 *  - Indices se representan vía ETF (SPY, QQQ, DIA, EZU…) — comportamiento
 *    de cotización casi idéntico, OHLCV completo en Yahoo.
 *  - Aliases ("ORO", "GOLD", "OIL") resuelven a tickers canónicos.
 *    Sin aliases, "GOLD" reventaría el pipeline.
 *  - asset_type debe coincidir con el enum DB para que un favorito pueda
 *    insertarse directo en watchlist_items.
 */
import type { AssetType } from '@/types/db';
import type { Category } from './categories';

export interface CatalogAsset {
  ticker: string;
  label: string;
  category: Category;
  asset_type: AssetType;
  aliases?: string[];
}

export const CATALOG: CatalogAsset[] = [
  // ─── Metales ─────────────────────────────────────────────────────────────
  // Spot metals (XAU/XAG/XPT/XPD vs USD) NO los sirve Yahoo de forma fiable
  // — el normalizador de finnhub.ts los convierte a XAUUSD=X y vuelven null.
  // Usamos contratos de futuros (Yahoo =F) que SÍ devuelven OHLCV:
  //   GC=F → Gold Continuous Futures (proxy spot oro)
  //   SI=F → Silver Continuous Futures
  //   PL=F → Platinum Continuous Futures
  //   PA=F → Palladium Continuous Futures
  // Los ETFs (GLD/SLV) siguen como entrada separada — distinto vehículo
  // (NAV vs contrato), distinto perfil de riesgo.
  { ticker: 'GC=F', label: 'Oro (futuros)',     category: 'metals', asset_type: 'commodity', aliases: ['GOLD', 'ORO'] },
  { ticker: 'SI=F', label: 'Plata (futuros)',   category: 'metals', asset_type: 'commodity', aliases: ['SILVER', 'PLATA'] },
  { ticker: 'PL=F', label: 'Platino (futuros)', category: 'metals', asset_type: 'commodity', aliases: ['PLATINUM'] },
  { ticker: 'PA=F', label: 'Paladio (futuros)', category: 'metals', asset_type: 'commodity', aliases: ['PALLADIUM'] },
  { ticker: 'GLD',  label: 'SPDR Gold Shares',    category: 'metals', asset_type: 'etf' },
  { ticker: 'SLV',  label: 'iShares Silver Trust', category: 'metals', asset_type: 'etf' },

  // ─── Índices (vía ETF) ───────────────────────────────────────────────────
  { ticker: 'SPY', label: 'S&P 500',          category: 'indices', asset_type: 'etf', aliases: ['SP500', 'SPX'] },
  { ticker: 'QQQ', label: 'Nasdaq 100',       category: 'indices', asset_type: 'etf', aliases: ['NASDAQ', 'NDX'] },
  { ticker: 'DIA', label: 'Dow Jones',        category: 'indices', asset_type: 'etf', aliases: ['DOW', 'DJIA'] },
  { ticker: 'IWM', label: 'Russell 2000',     category: 'indices', asset_type: 'etf', aliases: ['RUSSELL'] },
  { ticker: 'EZU', label: 'Eurozone (MSCI)',  category: 'indices', asset_type: 'etf', aliases: ['EUROSTOXX'] },
  { ticker: 'EWG', label: 'DAX (Alemania)',   category: 'indices', asset_type: 'etf', aliases: ['DAX'] },
  { ticker: 'EWJ', label: 'Nikkei (Japón)',   category: 'indices', asset_type: 'etf', aliases: ['NIKKEI'] },
  { ticker: 'EWU', label: 'FTSE (UK)',        category: 'indices', asset_type: 'etf', aliases: ['FTSE'] },
  { ticker: 'EWZ', label: 'Bovespa (Brasil)', category: 'indices', asset_type: 'etf' },
  { ticker: 'MCHI', label: 'MSCI China',      category: 'indices', asset_type: 'etf', aliases: ['CHINA'] },

  // ─── Materias primas (ETF / proxy) ───────────────────────────────────────
  { ticker: 'USO', label: 'Petróleo WTI',    category: 'commodities', asset_type: 'etf', aliases: ['OIL', 'WTI', 'PETROLEO'] },
  { ticker: 'BNO', label: 'Petróleo Brent',  category: 'commodities', asset_type: 'etf', aliases: ['BRENT'] },
  { ticker: 'UNG', label: 'Gas Natural',     category: 'commodities', asset_type: 'etf', aliases: ['NATGAS', 'GAS'] },
  { ticker: 'DBA', label: 'Agricultura',     category: 'commodities', asset_type: 'etf' },
  { ticker: 'CORN', label: 'Maíz',           category: 'commodities', asset_type: 'etf', aliases: ['MAIZ'] },
  { ticker: 'WEAT', label: 'Trigo',          category: 'commodities', asset_type: 'etf', aliases: ['WHEAT', 'TRIGO'] },
  { ticker: 'CPER', label: 'Cobre',          category: 'commodities', asset_type: 'etf', aliases: ['COPPER', 'COBRE'] },
  { ticker: 'URA',  label: 'Uranio',         category: 'commodities', asset_type: 'etf', aliases: ['URANIUM'] },

  // ─── Acciones (mega/large cap) ───────────────────────────────────────────
  { ticker: 'AAPL',  label: 'Apple',         category: 'equities', asset_type: 'equity' },
  { ticker: 'MSFT',  label: 'Microsoft',     category: 'equities', asset_type: 'equity' },
  { ticker: 'GOOGL', label: 'Alphabet',      category: 'equities', asset_type: 'equity', aliases: ['GOOGLE'] },
  { ticker: 'AMZN',  label: 'Amazon',        category: 'equities', asset_type: 'equity' },
  { ticker: 'NVDA',  label: 'Nvidia',        category: 'equities', asset_type: 'equity' },
  { ticker: 'META',  label: 'Meta',          category: 'equities', asset_type: 'equity', aliases: ['FACEBOOK', 'FB'] },
  { ticker: 'TSLA',  label: 'Tesla',         category: 'equities', asset_type: 'equity' },
  // Yahoo usa guion en lugar de punto para clases de acciones (BRK-B no BRK.B).
  { ticker: 'BRK-B', label: 'Berkshire Hathaway', category: 'equities', asset_type: 'equity', aliases: ['BERKSHIRE'] },
  { ticker: 'JPM',   label: 'JPMorgan',      category: 'equities', asset_type: 'equity' },
  { ticker: 'V',     label: 'Visa',          category: 'equities', asset_type: 'equity' },
  { ticker: 'MA',    label: 'Mastercard',    category: 'equities', asset_type: 'equity' },
  { ticker: 'JNJ',   label: 'Johnson & Johnson', category: 'equities', asset_type: 'equity' },
  { ticker: 'XOM',   label: 'ExxonMobil',    category: 'equities', asset_type: 'equity' },
  { ticker: 'KO',    label: 'Coca-Cola',     category: 'equities', asset_type: 'equity' },
  { ticker: 'DIS',   label: 'Disney',        category: 'equities', asset_type: 'equity' },
  { ticker: 'NFLX',  label: 'Netflix',       category: 'equities', asset_type: 'equity' },
  { ticker: 'AMD',   label: 'AMD',           category: 'equities', asset_type: 'equity' },
  { ticker: 'INTC',  label: 'Intel',         category: 'equities', asset_type: 'equity' },
  { ticker: 'BA',    label: 'Boeing',        category: 'equities', asset_type: 'equity' },
  { ticker: 'IBE.MC', label: 'Iberdrola',    category: 'equities', asset_type: 'equity' },
  { ticker: 'SAN.MC', label: 'Santander',    category: 'equities', asset_type: 'equity' },
  { ticker: 'BBVA.MC', label: 'BBVA',        category: 'equities', asset_type: 'equity' },
  { ticker: 'ITX.MC', label: 'Inditex',      category: 'equities', asset_type: 'equity' },
  { ticker: 'MC.PA',  label: 'LVMH',         category: 'equities', asset_type: 'equity', aliases: ['LVMH'] },
  { ticker: 'ASML.AS', label: 'ASML',        category: 'equities', asset_type: 'equity' },
  { ticker: 'SAP.DE', label: 'SAP',          category: 'equities', asset_type: 'equity' },

  // ─── ETFs (broad + sector) ───────────────────────────────────────────────
  { ticker: 'VOO', label: 'Vanguard S&P 500',  category: 'etf', asset_type: 'etf' },
  { ticker: 'VTI', label: 'Vanguard Total Market', category: 'etf', asset_type: 'etf' },
  { ticker: 'VEA', label: 'Vanguard Developed',  category: 'etf', asset_type: 'etf' },
  { ticker: 'VWO', label: 'Vanguard Emerging',   category: 'etf', asset_type: 'etf' },
  { ticker: 'XLF', label: 'Sector Financiero',   category: 'etf', asset_type: 'etf' },
  { ticker: 'XLK', label: 'Sector Tecnológico',  category: 'etf', asset_type: 'etf' },
  { ticker: 'XLE', label: 'Sector Energía',      category: 'etf', asset_type: 'etf' },
  { ticker: 'XLV', label: 'Sector Salud',        category: 'etf', asset_type: 'etf' },
  { ticker: 'XLY', label: 'Consumo Discrecional', category: 'etf', asset_type: 'etf' },
  { ticker: 'XLP', label: 'Consumo Básico',      category: 'etf', asset_type: 'etf' },
  { ticker: 'XLI', label: 'Sector Industrial',   category: 'etf', asset_type: 'etf' },
  { ticker: 'XLU', label: 'Sector Utilities',    category: 'etf', asset_type: 'etf' },
  { ticker: 'SMH', label: 'Semiconductores',     category: 'etf', asset_type: 'etf', aliases: ['SEMIS'] },
  { ticker: 'TLT', label: 'Bonos US 20+ años',   category: 'etf', asset_type: 'bond' },
  { ticker: 'HYG', label: 'High Yield Bonds',    category: 'etf', asset_type: 'bond' },

  // ─── Cripto ──────────────────────────────────────────────────────────────
  { ticker: 'BTC',  label: 'Bitcoin',  category: 'crypto', asset_type: 'crypto', aliases: ['BITCOIN'] },
  { ticker: 'ETH',  label: 'Ethereum', category: 'crypto', asset_type: 'crypto', aliases: ['ETHEREUM'] },
  { ticker: 'SOL',  label: 'Solana',   category: 'crypto', asset_type: 'crypto' },
  { ticker: 'BNB',  label: 'BNB',      category: 'crypto', asset_type: 'crypto' },
  { ticker: 'XRP',  label: 'XRP',      category: 'crypto', asset_type: 'crypto', aliases: ['RIPPLE'] },
  { ticker: 'ADA',  label: 'Cardano',  category: 'crypto', asset_type: 'crypto' },
  { ticker: 'DOGE', label: 'Dogecoin', category: 'crypto', asset_type: 'crypto' },
  { ticker: 'AVAX', label: 'Avalanche', category: 'crypto', asset_type: 'crypto' },
  { ticker: 'DOT',  label: 'Polkadot', category: 'crypto', asset_type: 'crypto' },
  { ticker: 'LINK', label: 'Chainlink', category: 'crypto', asset_type: 'crypto' },
  { ticker: 'MATIC', label: 'Polygon', category: 'crypto', asset_type: 'crypto' },
  { ticker: 'LTC',  label: 'Litecoin', category: 'crypto', asset_type: 'crypto' },
  { ticker: 'ATOM', label: 'Cosmos',   category: 'crypto', asset_type: 'crypto' },

  // ─── Forex (majors + algunos crosses) ────────────────────────────────────
  { ticker: 'EUR/USD', label: 'Euro · Dólar',     category: 'forex', asset_type: 'forex' },
  { ticker: 'GBP/USD', label: 'Libra · Dólar',    category: 'forex', asset_type: 'forex' },
  { ticker: 'USD/JPY', label: 'Dólar · Yen',      category: 'forex', asset_type: 'forex' },
  { ticker: 'USD/CHF', label: 'Dólar · Franco',   category: 'forex', asset_type: 'forex' },
  { ticker: 'AUD/USD', label: 'Aussie · Dólar',   category: 'forex', asset_type: 'forex' },
  { ticker: 'USD/CAD', label: 'Dólar · CAD',      category: 'forex', asset_type: 'forex' },
  { ticker: 'NZD/USD', label: 'Kiwi · Dólar',     category: 'forex', asset_type: 'forex' },
  { ticker: 'EUR/GBP', label: 'Euro · Libra',     category: 'forex', asset_type: 'forex' },
  { ticker: 'EUR/JPY', label: 'Euro · Yen',       category: 'forex', asset_type: 'forex' },
  { ticker: 'GBP/JPY', label: 'Libra · Yen',      category: 'forex', asset_type: 'forex' },
  { ticker: 'USD/MXN', label: 'Dólar · Peso MXN', category: 'forex', asset_type: 'forex' },
  // Yahoo sirve CNY (onshore yuan) de forma estable; CNH (offshore) es flaky.
  { ticker: 'USD/CNY', label: 'Dólar · Yuan',     category: 'forex', asset_type: 'forex' },
];

// Búsqueda O(1) por ticker canónico (upper).
const BY_TICKER: Map<string, CatalogAsset> = new Map(
  CATALOG.map((a) => [a.ticker.toUpperCase(), a] as const)
);

// Búsqueda O(1) por alias (upper) → ticker canónico.
const BY_ALIAS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const a of CATALOG) {
    if (!a.aliases) continue;
    for (const alias of a.aliases) m.set(alias.toUpperCase(), a.ticker);
  }
  return m;
})();

/**
 * Resuelve un input libre del usuario a un ticker canónico del catálogo.
 *
 *   "gold" → "XAU/USD"
 *   "AAPL" → "AAPL"
 *   "btc"  → "BTC"
 *   "ZZZZ" → "ZZZZ" (passthrough; el pipeline lo intentará igual)
 */
export function resolveTicker(input: string): string {
  const upper = input.trim().toUpperCase();
  if (!upper) return upper;
  if (BY_TICKER.has(upper)) return upper;
  const aliased = BY_ALIAS.get(upper);
  if (aliased) return aliased;
  return upper;
}

export function findAsset(ticker: string): CatalogAsset | undefined {
  return BY_TICKER.get(ticker.toUpperCase());
}
