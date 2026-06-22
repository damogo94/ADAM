/**
 * Tests de lib/market/cryptopanic — partes puras (símbolo + normalización).
 * El fetch (red + token) se mockea aguas arriba (snapshot).
 */

import { describe, it, expect } from 'vitest';
import { cryptoPanicCurrency, normalizeCryptoPanicPost } from '../cryptopanic';

describe('cryptoPanicCurrency', () => {
  it('devuelve el símbolo para crypto conocido (reusa coingeckoId real)', () => {
    expect(cryptoPanicCurrency('BTC')).toBe('BTC');
    expect(cryptoPanicCurrency('eth')).toBe('ETH');
  });

  it('tolera el sufijo -USD de Yahoo', () => {
    expect(cryptoPanicCurrency('BTC-USD')).toBe('BTC');
  });

  it('null para no-crypto', () => {
    expect(cryptoPanicCurrency('AAPL')).toBeNull();
    expect(cryptoPanicCurrency('EUR/USD')).toBeNull();
  });
});

describe('normalizeCryptoPanicPost', () => {
  const NOW = Date.parse('2026-06-22T12:00:00Z');

  it('mapea title/source/url y calcula age_hours', () => {
    const item = normalizeCryptoPanicPost(
      {
        title: 'BTC ETF inflows surge',
        url: 'https://cryptopanic.com/news/1',
        published_at: '2026-06-22T06:00:00Z',
        source: { title: 'CoinDesk', domain: 'coindesk.com' },
      },
      NOW
    );
    expect(item).not.toBeNull();
    expect(item!.headline).toBe('BTC ETF inflows surge');
    expect(item!.source).toBe('CoinDesk');
    expect(item!.age_hours).toBe(6);
    expect(item!.published_iso).toBe('2026-06-22T06:00:00.000Z');
  });

  it('cae a domain si no hay source.title; null age si falta published_at', () => {
    const item = normalizeCryptoPanicPost({ title: 'x', source: { domain: 'theblock.co' } }, NOW);
    expect(item!.source).toBe('theblock.co');
    expect(item!.age_hours).toBeNull();
    expect(item!.published_iso).toBeNull();
  });

  it('null si el post no tiene título', () => {
    expect(normalizeCryptoPanicPost({ url: 'x' }, NOW)).toBeNull();
  });
});
