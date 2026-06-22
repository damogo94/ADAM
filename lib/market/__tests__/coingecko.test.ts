/**
 * Tests de lib/market/coingecko — partes puras (map ticker→id + normalización).
 * El fetch en sí (red) no se testea aquí; se mockea aguas arriba (snapshot).
 */

import { describe, it, expect } from 'vitest';
import { coingeckoId, normalizeCoinGeckoRow } from '../coingecko';

describe('coingeckoId', () => {
  it('mapea los cryptos del catálogo', () => {
    expect(coingeckoId('BTC')).toBe('bitcoin');
    expect(coingeckoId('eth')).toBe('ethereum');
    expect(coingeckoId('MATIC')).toBe('matic-network');
    expect(coingeckoId('AVAX')).toBe('avalanche-2');
  });

  it('tolera el sufijo -USD que añade el normalizador de Yahoo', () => {
    expect(coingeckoId('BTC-USD')).toBe('bitcoin');
  });

  it('null para activos no-crypto', () => {
    expect(coingeckoId('AAPL')).toBeNull();
    expect(coingeckoId('EUR/USD')).toBeNull();
    expect(coingeckoId('')).toBeNull();
  });
});

describe('normalizeCoinGeckoRow', () => {
  it('mapea los campos que consumimos', () => {
    const r = normalizeCoinGeckoRow({
      market_cap: 1_300_000_000_000,
      market_cap_rank: 1,
      total_volume: 25_000_000_000,
      circulating_supply: 19_700_000,
      total_supply: 19_700_000,
      max_supply: 21_000_000,
      ath: 73_000,
      ath_change_percentage: -12.5,
      price_change_percentage_24h_in_currency: 1.2,
      price_change_percentage_7d_in_currency: -3.5,
      price_change_percentage_30d_in_currency: 8.1,
    });
    expect(r.market_cap_usd).toBe(1_300_000_000_000);
    expect(r.market_cap_rank).toBe(1);
    expect(r.volume_24h_usd).toBe(25_000_000_000);
    expect(r.max_supply).toBe(21_000_000);
    expect(r.ath_change_pct).toBe(-12.5);
    expect(r.price_change_pct_7d).toBe(-3.5);
    expect(r.price_change_pct_30d).toBe(8.1);
  });

  it('null-safe ante campos ausentes o no numéricos', () => {
    const r = normalizeCoinGeckoRow({ market_cap: null, max_supply: undefined });
    expect(r.market_cap_usd).toBeNull();
    expect(r.max_supply).toBeNull();
    expect(r.volume_24h_usd).toBeNull();
    expect(r.ath_change_pct).toBeNull();
  });
});
