/**
 * Tests de lib/market/coinmarketcap — parte pura (normalización de la fila).
 * El fetch (red) se mockea aguas arriba (crypto-fundamentals / snapshot).
 */

import { describe, it, expect } from 'vitest';
import { normalizeCmcRow } from '../coinmarketcap';

describe('normalizeCmcRow', () => {
  it('mapea rank/supply de la fila y momentum/market_cap/volumen del quote USD', () => {
    const r = normalizeCmcRow({
      cmc_rank: 1,
      circulating_supply: 20_046_387,
      total_supply: 20_046_387,
      max_supply: 21_000_000,
      quote: {
        USD: {
          market_cap: 1_300_052_740_156,
          volume_24h: 24_500_876_150,
          percent_change_24h: 1.35,
          percent_change_7d: -2.46,
          percent_change_30d: -13.95,
        },
      },
    });
    expect(r.market_cap_usd).toBe(1_300_052_740_156);
    expect(r.market_cap_rank).toBe(1);
    expect(r.volume_24h_usd).toBe(24_500_876_150);
    expect(r.max_supply).toBe(21_000_000);
    expect(r.price_change_pct_7d).toBe(-2.46);
    expect(r.price_change_pct_30d).toBe(-13.95);
  });

  it('ATH siempre null — CMC no lo expone (lo aporta CoinGecko)', () => {
    const r = normalizeCmcRow({ quote: { USD: { market_cap: 1 } } });
    expect(r.ath_usd).toBeNull();
    expect(r.ath_change_pct).toBeNull();
  });

  it('null-safe ante quote ausente o campos no numéricos', () => {
    const r = normalizeCmcRow({ cmc_rank: null, quote: null });
    expect(r.market_cap_usd).toBeNull();
    expect(r.market_cap_rank).toBeNull();
    expect(r.price_change_pct_24h).toBeNull();
  });
});
