/**
 * CoinMarketCap — proveedor PRIMARIO de fundamentals crypto para A1.
 *
 * El más autoritativo para market cap + rank, supply (circ/total/máx), volumen
 * y momentum (24h/7d/30d). NO expone ATH en `quotes/latest` (ni en el plan free):
 * `ath_usd`/`ath_change_pct` salen null y los aporta CoinGecko en el orquestador
 * (`crypto-fundamentals.ts`).
 *
 * Auth por header `X-CMC_PRO_API_KEY` (env `CMC_API_KEY`). Sin key → null
 * (degradación elegante; el orquestador cae a CoinGecko/CoinStats).
 *
 * Usamos el id NUMÉRICO (verificado en crypto-registry) en vez del símbolo: el
 * endpoint por símbolo colisiona (devuelve un array de monedas con el mismo
 * ticker); por id es inequívoco.
 */

import { cryptoMeta } from '@/lib/market/crypto-registry';
import type { CryptoSnapshot } from '@/agents/shared/types';

const CMC_BASE = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest';
const FETCH_TIMEOUT_MS = 5000;

/** Bloque de cotización en USD de CMC. Solo lo que consumimos. */
interface CmcQuoteUSD {
  market_cap?: number | null;
  volume_24h?: number | null;
  percent_change_24h?: number | null;
  percent_change_7d?: number | null;
  percent_change_30d?: number | null;
}

/** Fila (parcial) de quotes/latest. Solo lo que consumimos. */
interface CmcRow {
  cmc_rank?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  quote?: { USD?: CmcQuoteUSD | null } | null;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Normaliza una fila cruda de CMC a nuestra shape. Pura (testeable). */
export function normalizeCmcRow(row: CmcRow): CryptoSnapshot {
  const usd = row.quote?.USD ?? {};
  return {
    market_cap_usd: num(usd.market_cap),
    market_cap_rank: num(row.cmc_rank),
    volume_24h_usd: num(usd.volume_24h),
    circulating_supply: num(row.circulating_supply),
    total_supply: num(row.total_supply),
    max_supply: num(row.max_supply),
    ath_usd: null, // CMC quotes/latest no expone ATH → lo aporta CoinGecko.
    ath_change_pct: null,
    price_change_pct_24h: num(usd.percent_change_24h),
    price_change_pct_7d: num(usd.percent_change_7d),
    price_change_pct_30d: num(usd.percent_change_30d),
  };
}

/**
 * Fundamentals crypto vía CoinMarketCap. null si el ticker no es crypto conocido,
 * no hay key, la red falla, o CMC no devuelve la fila.
 */
export async function fetchCmcFundamentals(ticker: string): Promise<CryptoSnapshot | null> {
  const meta = cryptoMeta(ticker);
  const key = process.env.CMC_API_KEY;
  if (!meta || !key) return null;
  try {
    const res = await fetch(`${CMC_BASE}?id=${meta.cmcId}&convert=USD`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'X-CMC_PRO_API_KEY': key },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Record<string, CmcRow | CmcRow[]> };
    // Por id, `data[id]` es un objeto; por símbolo sería un array. Toleramos ambos.
    const entry = data.data?.[String(meta.cmcId)];
    const row = Array.isArray(entry) ? entry[0] : entry;
    if (!row) return null;
    return normalizeCmcRow(row);
  } catch {
    return null;
  }
}
