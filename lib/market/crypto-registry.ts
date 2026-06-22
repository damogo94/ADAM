/**
 * Registro NEUTRAL de las monedas crypto del catálogo (lib/catalog/assets.ts).
 *
 * Fuente única de verdad para dos cosas:
 *   1. Detectar si un ticker es crypto (`isCryptoTicker`).
 *   2. Mapearlo al id que cada proveedor de datos espera (`cryptoMeta`).
 *
 * Antes esta detección vivía ACOPLADA a CoinGecko (la función `coingeckoId`
 * hacía doble trabajo: detector + resolvedor de id). Ahora hay tres proveedores
 * de fundamentals/noticias con esquemas de id distintos (CoinMarketCap usa un id
 * numérico, CoinStats un slug propio, newsdata.io el símbolo en minúsculas), así
 * que el set de monedas vive aquí, neutral, y cada proveedor lee SU id.
 *
 * Los ids fueron VERIFICADOS contra las APIs reales (CMC /cryptocurrency/map,
 * CoinStats /coins, CoinGecko /coins/markets) — no son adivinados. Para añadir
 * una moneda nueva: añade su fila aquí y al catálogo; los proveedores la cogen
 * automáticamente.
 */

export interface CryptoMeta {
  /** Símbolo base canónico (BTC, ETH…). Clave del registro. */
  symbol: string;
  /** CoinMarketCap numeric id (quotes/latest?id=). Verificado vía /cryptocurrency/map. */
  cmcId: number;
  /** CoinGecko coin id (/coins/markets?ids=). */
  coingeckoId: string;
  /** CoinStats coin id (/coins/{id}). */
  coinstatsId: string;
  /** newsdata.io coin code (?coin=) — el símbolo en minúsculas. */
  newsdataCoin: string;
}

/**
 * Las 13 monedas del catálogo. Si MATIC parece "muerta" en CMC/CoinStats es por
 * la migración a POL; CoinGecko aún la cubre y el orquestador degrada con gracia.
 */
const REGISTRY: Record<string, CryptoMeta> = {
  BTC:   { symbol: 'BTC',   cmcId: 1,    coingeckoId: 'bitcoin',       coinstatsId: 'bitcoin',       newsdataCoin: 'btc' },
  ETH:   { symbol: 'ETH',   cmcId: 1027, coingeckoId: 'ethereum',      coinstatsId: 'ethereum',      newsdataCoin: 'eth' },
  SOL:   { symbol: 'SOL',   cmcId: 5426, coingeckoId: 'solana',        coinstatsId: 'solana',        newsdataCoin: 'sol' },
  BNB:   { symbol: 'BNB',   cmcId: 1839, coingeckoId: 'binancecoin',   coinstatsId: 'binance-coin',  newsdataCoin: 'bnb' },
  XRP:   { symbol: 'XRP',   cmcId: 52,   coingeckoId: 'ripple',        coinstatsId: 'ripple',        newsdataCoin: 'xrp' },
  ADA:   { symbol: 'ADA',   cmcId: 2010, coingeckoId: 'cardano',       coinstatsId: 'cardano',       newsdataCoin: 'ada' },
  DOGE:  { symbol: 'DOGE',  cmcId: 74,   coingeckoId: 'dogecoin',      coinstatsId: 'dogecoin',      newsdataCoin: 'doge' },
  AVAX:  { symbol: 'AVAX',  cmcId: 5805, coingeckoId: 'avalanche-2',   coinstatsId: 'avalanche-2',   newsdataCoin: 'avax' },
  DOT:   { symbol: 'DOT',   cmcId: 6636, coingeckoId: 'polkadot',      coinstatsId: 'polkadot',      newsdataCoin: 'dot' },
  LINK:  { symbol: 'LINK',  cmcId: 1975, coingeckoId: 'chainlink',     coinstatsId: 'chainlink',     newsdataCoin: 'link' },
  MATIC: { symbol: 'MATIC', cmcId: 3890, coingeckoId: 'matic-network', coinstatsId: 'matic-network', newsdataCoin: 'matic' },
  LTC:   { symbol: 'LTC',   cmcId: 2,    coingeckoId: 'litecoin',      coinstatsId: 'litecoin',      newsdataCoin: 'ltc' },
  ATOM:  { symbol: 'ATOM',  cmcId: 3794, coingeckoId: 'cosmos',        coinstatsId: 'cosmos',        newsdataCoin: 'atom' },
};

/**
 * Normaliza un ticker a su símbolo base: trim, mayúsculas y quita el sufijo
 * `-USD` que añade el normalizador de Yahoo (BTC-USD → BTC).
 */
function baseSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/-USD$/, '');
}

/** Metadatos del activo crypto, o null si el ticker no es una crypto conocida. */
export function cryptoMeta(ticker: string): CryptoMeta | null {
  return REGISTRY[baseSymbol(ticker)] ?? null;
}

/** True si el ticker es una crypto del catálogo. Detector neutral de proveedor. */
export function isCryptoTicker(ticker: string): boolean {
  return cryptoMeta(ticker) !== null;
}
