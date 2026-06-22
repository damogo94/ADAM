/**
 * Tests del orquestador de fundamentals crypto — la cadena de fallback y el
 * injerto de ATH. Los proveedores se mockean: aquí solo testeamos la lógica de
 * selección (CMC primario ∥ CoinGecko, CoinStats último recurso).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CryptoSnapshot } from '@/agents/shared/types';

vi.mock('@/lib/market/coinmarketcap', () => ({ fetchCmcFundamentals: vi.fn() }));
vi.mock('@/lib/market/coingecko', () => ({ fetchCryptoMarketData: vi.fn() }));
vi.mock('@/lib/market/coinstats', () => ({ fetchCoinStatsFundamentals: vi.fn() }));
vi.mock('@/lib/market/crypto-registry', () => ({ isCryptoTicker: vi.fn() }));

import { fetchCryptoFundamentals } from '../crypto-fundamentals';
import { fetchCmcFundamentals } from '@/lib/market/coinmarketcap';
import { fetchCryptoMarketData } from '@/lib/market/coingecko';
import { fetchCoinStatsFundamentals } from '@/lib/market/coinstats';
import { isCryptoTicker } from '@/lib/market/crypto-registry';

const snap = (over: Partial<CryptoSnapshot> = {}): CryptoSnapshot => ({
  market_cap_usd: 1,
  market_cap_rank: 1,
  volume_24h_usd: 1,
  circulating_supply: 1,
  total_supply: 1,
  max_supply: null,
  ath_usd: null,
  ath_change_pct: null,
  price_change_pct_24h: null,
  price_change_pct_7d: null,
  price_change_pct_30d: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCryptoTicker).mockReturnValue(true);
  vi.mocked(fetchCmcFundamentals).mockResolvedValue(null);
  vi.mocked(fetchCryptoMarketData).mockResolvedValue(null);
  vi.mocked(fetchCoinStatsFundamentals).mockResolvedValue(null);
});

describe('fetchCryptoFundamentals', () => {
  it('null inmediato si el ticker no es crypto (sin tocar proveedores)', async () => {
    vi.mocked(isCryptoTicker).mockReturnValue(false);
    expect(await fetchCryptoFundamentals('AAPL')).toBeNull();
    expect(fetchCmcFundamentals).not.toHaveBeenCalled();
    expect(fetchCoinStatsFundamentals).not.toHaveBeenCalled();
  });

  it('usa CMC como base e injerta el ATH de CoinGecko', async () => {
    vi.mocked(fetchCmcFundamentals).mockResolvedValue(snap({ market_cap_rank: 1, ath_usd: null }));
    vi.mocked(fetchCryptoMarketData).mockResolvedValue(snap({ ath_usd: 73_000, ath_change_pct: -12.5 }));
    const r = await fetchCryptoFundamentals('BTC');
    expect(r?.market_cap_rank).toBe(1); // base = CMC
    expect(r?.ath_usd).toBe(73_000); // ATH injertado desde CoinGecko
    expect(r?.ath_change_pct).toBe(-12.5);
  });

  it('cae a CoinGecko (con su ATH) si CMC devuelve null', async () => {
    vi.mocked(fetchCmcFundamentals).mockResolvedValue(null);
    vi.mocked(fetchCryptoMarketData).mockResolvedValue(snap({ market_cap_rank: 9, ath_usd: 100 }));
    const r = await fetchCryptoFundamentals('BTC');
    expect(r?.market_cap_rank).toBe(9);
    expect(r?.ath_usd).toBe(100);
    expect(fetchCoinStatsFundamentals).not.toHaveBeenCalled(); // CoinGecko bastó
  });

  it('solo llama a CoinStats si CMC y CoinGecko fallan ambos', async () => {
    vi.mocked(fetchCoinStatsFundamentals).mockResolvedValue(snap({ market_cap_rank: 42 }));
    const r = await fetchCryptoFundamentals('BTC');
    expect(fetchCoinStatsFundamentals).toHaveBeenCalledOnce();
    expect(r?.market_cap_rank).toBe(42);
  });

  it('null si los tres proveedores fallan', async () => {
    expect(await fetchCryptoFundamentals('BTC')).toBeNull();
  });
});
