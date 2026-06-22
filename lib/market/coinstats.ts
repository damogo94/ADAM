/**
 * CoinStats — proveedor de ÚLTIMO RECURSO de fundamentals crypto.
 *
 * Solo se llama si CMC (primario) y CoinGecko (paralelo, aporta ATH) fallan
 * ambos — ver el orquestador en `crypto-fundamentals.ts`. Da market cap + rank,
 * supply (circ/total), volumen y momentum (24h/7d/30d). NO expone max supply ni
 * ATH → esos salen null.
 *
 * Auth por header `X-API-KEY` (env `COINSTATS_API_KEY`). Sin key → null.
 * El endpoint `/coins/{id}` devuelve el objeto de la moneda directamente (sin
 * envoltura). Para monedas migradas (p.ej. MATIC→POL) devuelve marketCap 0; el
 * dato sigue siendo válido aunque stale, y este proveedor es el último recurso.
 */

import { cryptoMeta } from '@/lib/market/crypto-registry';
import type { CryptoSnapshot } from '@/agents/shared/types';

const COINSTATS_BASE = 'https://openapiv1.coinstats.app/coins';
const FETCH_TIMEOUT_MS = 5000;

/** Objeto de moneda de CoinStats. Solo lo que consumimos. */
interface CoinStatsCoin {
  marketCap?: number | null;
  rank?: number | null;
  volume?: number | null;
  availableSupply?: number | null; // = circulating
  totalSupply?: number | null;
  priceChange1d?: number | null; // = 24h
  priceChange1w?: number | null; // = 7d
  priceChange1m?: number | null; // = 30d
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Normaliza el objeto de CoinStats a nuestra shape. Pura (testeable). */
export function normalizeCoinStatsCoin(c: CoinStatsCoin): CryptoSnapshot {
  return {
    market_cap_usd: num(c.marketCap),
    market_cap_rank: num(c.rank),
    volume_24h_usd: num(c.volume),
    circulating_supply: num(c.availableSupply),
    total_supply: num(c.totalSupply),
    max_supply: null, // CoinStats no expone max supply.
    ath_usd: null, // ni ATH → lo aporta CoinGecko si está vivo.
    ath_change_pct: null,
    price_change_pct_24h: num(c.priceChange1d),
    price_change_pct_7d: num(c.priceChange1w),
    price_change_pct_30d: num(c.priceChange1m),
  };
}

/**
 * Fundamentals crypto vía CoinStats. null si el ticker no es crypto conocido,
 * no hay key, la red falla, o la respuesta no es un objeto de moneda.
 */
export async function fetchCoinStatsFundamentals(ticker: string): Promise<CryptoSnapshot | null> {
  const meta = cryptoMeta(ticker);
  const key = process.env.COINSTATS_API_KEY;
  if (!meta || !key) return null;
  try {
    const res = await fetch(`${COINSTATS_BASE}/${encodeURIComponent(meta.coinstatsId)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'X-API-KEY': key },
    });
    if (!res.ok) return null;
    const coin = (await res.json()) as CoinStatsCoin | null;
    if (!coin || typeof coin !== 'object') return null;
    return normalizeCoinStatsCoin(coin);
  } catch {
    return null;
  }
}
