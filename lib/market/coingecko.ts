/**
 * CoinGecko — fundamentals de crypto para A1.
 *
 * Finnhub (free) NO cubre crypto: `finnhubOverview`/`finnhubNews` devuelven
 * null/[] para BTC, ETH, etc. → A1 quedaba "data-starved" en crypto (oportunidad
 * 0/209 en prod, arrastrando la confluencia). CoinGecko da los "fundamentals"
 * que SÍ aplican a un activo crypto: market cap + rank, volumen, supply
 * (circulante/total/máx), distancia a ATH y momentum 24h/7d/30d.
 *
 * Free tier sin key (~30 req/min). Si hay `COINGECKO_API_KEY` en env, se manda
 * como demo key (x-cg-demo-api-key) para subir el límite — pero funciona sin ella.
 *
 * Noticias/narrativa crypto quedan FUERA de v1 (necesitan otro proveedor) —
 * decisión del owner. Esto solo cubre los fundamentals.
 */

import type { CryptoSnapshot } from '@/agents/shared/types';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FETCH_TIMEOUT_MS = 6000;

/**
 * Map ticker canónico → CoinGecko coin id. Cubre el set de crypto del catálogo
 * (lib/catalog/assets.ts). Un ticker fuera de este map → null (no fetch).
 */
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  LTC: 'litecoin',
  ATOM: 'cosmos',
};

/**
 * Resuelve un ticker a su CoinGecko id, o null si no es un crypto conocido.
 * Tolera el sufijo `-USD` que añade el normalizador de Yahoo (BTC-USD → BTC).
 */
export function coingeckoId(ticker: string): string | null {
  const base = ticker.trim().toUpperCase().replace(/-USD$/, '');
  return COINGECKO_IDS[base] ?? null;
}

/** Forma (parcial) de una fila de /coins/markets. Solo lo que consumimos. */
interface CoinGeckoMarketRow {
  market_cap?: number | null;
  market_cap_rank?: number | null;
  total_volume?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  ath?: number | null;
  ath_change_percentage?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Normaliza una fila cruda de CoinGecko a nuestra shape. Pura (testeable). */
export function normalizeCoinGeckoRow(row: CoinGeckoMarketRow): CryptoSnapshot {
  return {
    market_cap_usd: num(row.market_cap),
    market_cap_rank: num(row.market_cap_rank),
    volume_24h_usd: num(row.total_volume),
    circulating_supply: num(row.circulating_supply),
    total_supply: num(row.total_supply),
    max_supply: num(row.max_supply),
    ath_usd: num(row.ath),
    ath_change_pct: num(row.ath_change_percentage),
    price_change_pct_24h: num(row.price_change_percentage_24h_in_currency),
    price_change_pct_7d: num(row.price_change_percentage_7d_in_currency),
    price_change_pct_30d: num(row.price_change_percentage_30d_in_currency),
  };
}

/**
 * Fundamentals crypto vía CoinGecko. Devuelve null si el ticker no es crypto
 * conocido, si la red falla, o si CoinGecko no devuelve la fila.
 */
export async function fetchCryptoMarketData(ticker: string): Promise<CryptoSnapshot | null> {
  const id = coingeckoId(ticker);
  if (!id) return null;
  try {
    const url =
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}` +
      `&price_change_percentage=24h,7d,30d&sparkline=false`;
    const apiKey = process.env.COINGECKO_API_KEY;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: apiKey ? { 'x-cg-demo-api-key': apiKey } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CoinGeckoMarketRow[];
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;
    return normalizeCoinGeckoRow(row);
  } catch {
    return null;
  }
}
