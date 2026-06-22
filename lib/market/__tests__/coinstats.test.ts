/**
 * Tests de lib/market/coinstats — parte pura (normalización del objeto moneda).
 */

import { describe, it, expect } from 'vitest';
import { normalizeCoinStatsCoin } from '../coinstats';

describe('normalizeCoinStatsCoin', () => {
  it('mapea los campos de CoinStats (availableSupply→circulating, 1d/1w/1m→momentum)', () => {
    const r = normalizeCoinStatsCoin({
      marketCap: 1_302_416_922_756,
      rank: 1,
      volume: 26_684_040_045,
      availableSupply: 20_046_371,
      totalSupply: 20_046_371,
      priceChange1d: 1.46,
      priceChange1w: -2.27,
      priceChange1m: -13.86,
    });
    expect(r.market_cap_usd).toBe(1_302_416_922_756);
    expect(r.market_cap_rank).toBe(1);
    expect(r.circulating_supply).toBe(20_046_371);
    expect(r.price_change_pct_24h).toBe(1.46);
    expect(r.price_change_pct_7d).toBe(-2.27);
    expect(r.price_change_pct_30d).toBe(-13.86);
  });

  it('max_supply y ATH siempre null — CoinStats no los expone', () => {
    const r = normalizeCoinStatsCoin({ marketCap: 1 });
    expect(r.max_supply).toBeNull();
    expect(r.ath_usd).toBeNull();
    expect(r.ath_change_pct).toBeNull();
  });

  it('null-safe ante campos ausentes o no numéricos', () => {
    const r = normalizeCoinStatsCoin({ marketCap: null, volume: undefined });
    expect(r.market_cap_usd).toBeNull();
    expect(r.volume_24h_usd).toBeNull();
    expect(r.circulating_supply).toBeNull();
  });
});
