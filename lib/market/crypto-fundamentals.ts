/**
 * Orquestador de fundamentals crypto para A1.
 *
 * Estrategia (decisión del owner, ver CLAUDE.md/PR):
 *   - PRIMARIO: CoinMarketCap — el más autoritativo (market cap, rank, supply,
 *     volumen, momentum), pero NO da ATH.
 *   - PARALELO: CoinGecko — único proveedor que da ATH; corre a la vez que CMC
 *     (latencia plana ~5s) tanto para injertar ATH como de backup si CMC cae.
 *   - ÚLTIMO RECURSO: CoinStats — solo se llama si CMC y CoinGecko fallan ambos.
 *
 * Devuelve el `CryptoSnapshot` ya ensamblado, o null si el ticker no es crypto o
 * los tres proveedores fallan. Resiliente: cada fetch ya degrada a null por su
 * cuenta; aquí además envolvemos en `.catch` por defensa en profundidad.
 */

import { fetchCmcFundamentals } from '@/lib/market/coinmarketcap';
import { fetchCryptoMarketData } from '@/lib/market/coingecko';
import { fetchCoinStatsFundamentals } from '@/lib/market/coinstats';
import { isCryptoTicker } from '@/lib/market/crypto-registry';
import type { CryptoSnapshot } from '@/agents/shared/types';

export async function fetchCryptoFundamentals(ticker: string): Promise<CryptoSnapshot | null> {
  if (!isCryptoTicker(ticker)) return null;

  // CMC ∥ CoinGecko en paralelo: CMC es el primario; CoinGecko aporta ATH y backup.
  const [cmc, gecko] = await Promise.all([
    fetchCmcFundamentals(ticker).catch(() => null),
    fetchCryptoMarketData(ticker).catch(() => null),
  ]);

  let base = cmc ?? gecko;

  // Solo si AMBOS primarios caen pagamos la latencia del último recurso.
  if (!base) base = await fetchCoinStatsFundamentals(ticker).catch(() => null);

  if (!base) return null;

  // ATH solo lo aporta CoinGecko. Si el primario fue CMC (base !== gecko) y
  // CoinGecko respondió, injertamos sus campos de ATH en la base.
  if (base !== gecko && gecko) {
    base = { ...base, ath_usd: gecko.ath_usd, ath_change_pct: gecko.ath_change_pct };
  }

  return base;
}
