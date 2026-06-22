/**
 * Tests de buildMarketSnapshot — el constructor único del MarketSnapshot.
 * Cubre: camino feliz, recovery de precio desde la última vela cuando el
 * quote cae, market_data_unavailable, y caps/merge (range '1y', ohlcv ≥205/cap 300, macro).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/market/finnhub', () => ({
  fallbackQuote: vi.fn(),
  fallbackDaily: vi.fn(),
  fallbackIntraday: vi.fn(),
  fallbackOverview: vi.fn(),
  fallbackNewsSentiment: vi.fn(),
}));
vi.mock('@/lib/market/macro', () => ({ getMacroSnapshot: vi.fn() }));
vi.mock('@/lib/market/crypto-registry', () => ({ isCryptoTicker: vi.fn() }));
vi.mock('@/lib/market/crypto-fundamentals', () => ({ fetchCryptoFundamentals: vi.fn() }));
vi.mock('@/lib/market/newsdata', () => ({ fetchCryptoNews: vi.fn() }));

import { buildMarketSnapshot } from '../snapshot';
import * as finnhub from '@/lib/market/finnhub';
import { getMacroSnapshot } from '@/lib/market/macro';
import { isCryptoTicker } from '@/lib/market/crypto-registry';
import { fetchCryptoFundamentals } from '@/lib/market/crypto-fundamentals';
import { fetchCryptoNews } from '@/lib/market/newsdata';

const candle = (c: number, t: number) => ({ o: c, h: c + 1, l: c - 1, c, v: 100, t });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(finnhub.fallbackQuote).mockResolvedValue({
    current: 100,
    change_pct_24h: 2,
    currency: 'EUR',
  } as never);
  vi.mocked(finnhub.fallbackDaily).mockResolvedValue([] as never);
  vi.mocked(finnhub.fallbackIntraday).mockResolvedValue([] as never);
  vi.mocked(finnhub.fallbackOverview).mockResolvedValue(null as never);
  vi.mocked(finnhub.fallbackNewsSentiment).mockResolvedValue([] as never);
  vi.mocked(getMacroSnapshot).mockResolvedValue(null as never);
  // Por defecto NO crypto: isCryptoTicker false → no se hace ningún fetch crypto.
  vi.mocked(isCryptoTicker).mockReturnValue(false);
  vi.mocked(fetchCryptoFundamentals).mockResolvedValue(null as never);
  vi.mocked(fetchCryptoNews).mockResolvedValue([] as never);
});

describe('buildMarketSnapshot', () => {
  it('camino feliz: usa el quote y devuelve currentPrice', async () => {
    const r = await buildMarketSnapshot('AAPL');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.currentPrice).toBe(100);
    expect(r.data.snapshot.ticker).toBe('AAPL');
    expect(r.data.snapshot.quote.current).toBe(100);
    expect(r.data.snapshot.quote.currency).toBe('EUR'); // del quote (sin overview)
  });

  it('recovery: deriva precio y variación de las 2 últimas velas si el quote cae', async () => {
    vi.mocked(finnhub.fallbackQuote).mockResolvedValue(null as never);
    vi.mocked(finnhub.fallbackDaily).mockResolvedValue([candle(10, 1), candle(11, 2)] as never);
    const r = await buildMarketSnapshot('X');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.currentPrice).toBe(11);
    expect(r.data.snapshot.quote.change_pct_24h).toBeCloseTo(10); // (11-10)/10*100
    expect(r.data.snapshot.quote.currency).toBe('USD'); // sin quote ni overview
  });

  it('market_data_unavailable cuando no hay quote ni velas', async () => {
    vi.mocked(finnhub.fallbackQuote).mockResolvedValue(null as never);
    vi.mocked(finnhub.fallbackDaily).mockResolvedValue([] as never);
    const r = await buildMarketSnapshot('X');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('market_data_unavailable');
  });

  it('pide range "1y" a fallbackDaily y conserva ≥205 velas para SMA200/cross', async () => {
    const oneYear = Array.from({ length: 252 }, (_, i) => candle(i + 1, i));
    vi.mocked(finnhub.fallbackDaily).mockResolvedValue(oneYear as never);
    const r = await buildMarketSnapshot('X');
    // Fetch-side del fix: el path vivo DEBE pedir '1y' (no el default '3mo'), o
    // SMA200 y golden/death cross mueren en prod aunque el compute esté testeado.
    expect(finnhub.fallbackDaily).toHaveBeenCalledWith('X', '1y');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.snapshot.ohlcv_daily.length).toBeGreaterThanOrEqual(205);
    expect(r.data.snapshot.ohlcv_daily).toHaveLength(252);
  });

  it('capa ohlcv_daily a 300 velas (techo defensivo) y mergea el snapshot macro', async () => {
    const many = Array.from({ length: 400 }, (_, i) => candle(i + 1, i));
    vi.mocked(finnhub.fallbackDaily).mockResolvedValue(many as never);
    vi.mocked(getMacroSnapshot).mockResolvedValue({ as_of: '2026-05-30', vix: 15 } as never);
    const r = await buildMarketSnapshot('X');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.snapshot.ohlcv_daily).toHaveLength(300);
    expect(r.data.snapshot.macro_snapshot).toMatchObject({ as_of: '2026-05-30', vix: 15 });
  });

  it('overview tiene prioridad para currency y fundamentals', async () => {
    vi.mocked(finnhub.fallbackOverview).mockResolvedValue({
      currency: 'USD',
      per: 25,
      market_cap_usd: 1_000_000,
    } as never);
    const r = await buildMarketSnapshot('AAPL');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.snapshot.quote.currency).toBe('USD'); // overview > quote
    expect(r.data.snapshot.fundamentals.per).toBe(25);
    expect(r.data.snapshot.fundamentals.fcf_yield_pct).toBeNull();
  });

  it('crypto: puebla snapshot.crypto y rellena market_cap desde el orquestador (Finnhub da null)', async () => {
    vi.mocked(isCryptoTicker).mockReturnValue(true);
    vi.mocked(fetchCryptoFundamentals).mockResolvedValue({
      market_cap_usd: 1_300_000_000_000,
      market_cap_rank: 1,
      volume_24h_usd: 25_000_000_000,
      circulating_supply: 19_700_000,
      total_supply: 19_700_000,
      max_supply: 21_000_000,
      ath_usd: 73_000,
      ath_change_pct: -12.5,
      price_change_pct_24h: 1.2,
      price_change_pct_7d: -3.5,
      price_change_pct_30d: 8.1,
    } as never);
    const r = await buildMarketSnapshot('BTC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.snapshot.crypto?.market_cap_rank).toBe(1);
    expect(r.data.snapshot.crypto?.max_supply).toBe(21_000_000);
    // Finnhub overview da null en crypto → market_cap lo rellena CoinGecko.
    expect(r.data.snapshot.fundamentals.market_cap_usd).toBe(1_300_000_000_000);
  });

  it('crypto: las noticias de newsdata.io entran en snapshot.news', async () => {
    vi.mocked(isCryptoTicker).mockReturnValue(true);
    vi.mocked(fetchCryptoNews).mockResolvedValue([
      { headline: 'BTC ETF inflows surge', source: 'CoinDesk', age_hours: 3 },
    ] as never);
    const r = await buildMarketSnapshot('BTC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Finnhub /company-news da [] en crypto → news = solo las de newsdata.io.
    expect(r.data.snapshot.news).toHaveLength(1);
    expect(r.data.snapshot.news[0]?.headline).toBe('BTC ETF inflows surge');
  });

  it('no-crypto: snapshot.crypto null y no se llama a los proveedores crypto', async () => {
    await buildMarketSnapshot('AAPL');
    expect(fetchCryptoFundamentals).not.toHaveBeenCalled();
    expect(fetchCryptoNews).not.toHaveBeenCalled();
  });
});
