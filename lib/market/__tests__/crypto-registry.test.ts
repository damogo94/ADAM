/**
 * Tests del registro neutral de crypto — detección + mapeo de ids por proveedor.
 */

import { describe, it, expect } from 'vitest';
import { cryptoMeta, isCryptoTicker } from '../crypto-registry';

describe('isCryptoTicker', () => {
  it('reconoce los cryptos del catálogo (case-insensitive)', () => {
    expect(isCryptoTicker('BTC')).toBe(true);
    expect(isCryptoTicker('eth')).toBe(true);
    expect(isCryptoTicker('Matic')).toBe(true);
  });

  it('tolera el sufijo -USD de Yahoo y espacios', () => {
    expect(isCryptoTicker('BTC-USD')).toBe(true);
    expect(isCryptoTicker('\tSOL\n')).toBe(true);
  });

  it('false para no-crypto', () => {
    expect(isCryptoTicker('AAPL')).toBe(false);
    expect(isCryptoTicker('EUR/USD')).toBe(false);
    expect(isCryptoTicker('')).toBe(false);
  });
});

describe('cryptoMeta', () => {
  it('expone el id de cada proveedor para una moneda', () => {
    const btc = cryptoMeta('BTC');
    expect(btc).toMatchObject({
      symbol: 'BTC',
      cmcId: 1,
      coingeckoId: 'bitcoin',
      coinstatsId: 'bitcoin',
      newsdataCoin: 'btc',
    });
  });

  it('resuelve los ids divergentes entre proveedores (BNB)', () => {
    const bnb = cryptoMeta('BNB-USD');
    // CoinGecko: binancecoin · CoinStats: binance-coin — son distintos a propósito.
    expect(bnb?.coingeckoId).toBe('binancecoin');
    expect(bnb?.coinstatsId).toBe('binance-coin');
    expect(bnb?.cmcId).toBe(1839);
  });

  it('null para no-crypto', () => {
    expect(cryptoMeta('AAPL')).toBeNull();
  });
});
