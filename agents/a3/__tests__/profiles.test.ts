import { describe, it, expect } from 'vitest';
import { classOf, profileFor, roundProfile } from '../profiles';

describe('classOf — hits del catálogo', () => {
  it('AAPL → equity', () => {
    expect(classOf('AAPL')).toBe('equity');
  });

  it('BTC → crypto', () => {
    expect(classOf('BTC')).toBe('crypto');
  });

  it('EUR/USD → forex', () => {
    expect(classOf('EUR/USD')).toBe('forex');
  });

  it('SPY → index_etf (categoría indices en catálogo)', () => {
    expect(classOf('SPY')).toBe('index_etf');
  });

  it('QQQ → index_etf', () => {
    expect(classOf('QQQ')).toBe('index_etf');
  });

  it('TLT → bond_etf (asset_type bond en catálogo)', () => {
    expect(classOf('TLT')).toBe('bond_etf');
  });

  it('HYG → bond_etf', () => {
    expect(classOf('HYG')).toBe('bond_etf');
  });

  it('GLD → commodity (categoría metals)', () => {
    expect(classOf('GLD')).toBe('commodity');
  });

  it('USO → commodity (categoría commodities)', () => {
    expect(classOf('USO')).toBe('commodity');
  });

  it('XLF → equity (sector ETF, no índice ni bond)', () => {
    expect(classOf('XLF')).toBe('equity');
  });

  it('GC=F → commodity (oro futuros, en catálogo)', () => {
    expect(classOf('GC=F')).toBe('commodity');
  });

  it('case-insensitive: aapl → equity', () => {
    expect(classOf('aapl')).toBe('equity');
  });
});

describe('classOf — heurísticas (ticker no en catálogo)', () => {
  it('Yahoo forex EURUSD=X → forex', () => {
    expect(classOf('EURUSD=X')).toBe('forex');
  });

  it('XAU/USD por heurística (ya no está en catálogo) → commodity por METAL_BASES', () => {
    // Tras el fix v1.1, los metales spot salieron del catálogo (Yahoo no
    // sirve XAUUSD=X). La heurística por METAL_BASES cubre el caso si
    // un caller pasa todavía XAU/USD o XAU/EUR.
    expect(classOf('XAU/USD')).toBe('commodity');
    expect(classOf('XAU/EUR')).toBe('commodity');
  });

  it('par 3+3 no-metal → forex (NZD/CHF no está en catálogo)', () => {
    expect(classOf('NZD/CHF')).toBe('forex');
  });

  it('BTC-USD (yahoo crypto pair) → crypto', () => {
    expect(classOf('BTC-USD')).toBe('crypto');
  });

  it('ETH-USDT (stable pair) → crypto', () => {
    expect(classOf('ETH-USDT')).toBe('crypto');
  });

  it('SHIB (crypto NO en catálogo) → equity (fallback conservador)', () => {
    // SHIB no está en CRYPTO_SOLO ni en catálogo. Demuestra el fallback.
    // Cuando se añada SHIB, este test cambiará a esperar 'crypto'.
    expect(classOf('SHIB')).toBe('equity');
  });

  it('SOL (en CRYPTO_SOLO) → crypto', () => {
    expect(classOf('SOL')).toBe('crypto');
  });

  it('^GSPC (yahoo índice raw) → index_etf', () => {
    expect(classOf('^GSPC')).toBe('index_etf');
  });

  it('sufijo bolsa europea .MC → equity (IBE.MC en catálogo es equity)', () => {
    expect(classOf('IBE.MC')).toBe('equity');
  });

  it('sufijo .L (London, no en catálogo) → equity', () => {
    expect(classOf('LLOY.L')).toBe('equity');
  });

  it('ticker desconocido → equity (default conservador)', () => {
    expect(classOf('NOPE')).toBe('equity');
  });

  it('string vacío → equity', () => {
    expect(classOf('')).toBe('equity');
  });

  it('trim de whitespace', () => {
    expect(classOf('  BTC  ')).toBe('crypto');
  });
});

describe('profileFor — devuelve el profile con valores plausibles', () => {
  it('forex tiene proximity_pct < 1 y 5 decimales', () => {
    const p = profileFor('EUR/USD');
    expect(p.proximity_pct).toBeLessThan(1);
    expect(p.round_decimals).toBe(5);
  });

  it('crypto tiene proximity_pct >= 3 y min_rb >= 2', () => {
    const p = profileFor('BTC');
    expect(p.proximity_pct).toBeGreaterThanOrEqual(3);
    expect(p.min_rb_ratio).toBeGreaterThanOrEqual(2);
  });

  it('equity coincide con defaults históricos (proximity 3, atr 1, rb 1.5)', () => {
    // Regression guard: si esto cambia, los tests de operative.test.ts
    // sin profile pueden romperse. Equity = baseline pre-PR5.
    const p = profileFor('AAPL');
    expect(p.proximity_pct).toBe(3);
    expect(p.atr_fallback_pct).toBe(1);
    expect(p.min_rb_ratio).toBe(1.5);
    expect(p.round_decimals).toBe(2);
  });

  it('bond_etf tiene min_rb < 1.5 (no quedar bloqueado en hold)', () => {
    const p = profileFor('TLT');
    expect(p.min_rb_ratio).toBeLessThan(1.5);
  });

  it('todos los profiles tienen class != null y valores > 0', () => {
    const tickers = ['BTC', 'EUR/USD', 'AAPL', 'GLD', 'SPY', 'TLT'];
    for (const t of tickers) {
      const p = profileFor(t);
      expect(p.class).toBeTruthy();
      expect(p.proximity_pct).toBeGreaterThan(0);
      expect(p.atr_fallback_pct).toBeGreaterThan(0);
      expect(p.min_rb_ratio).toBeGreaterThan(0);
    }
  });
});

describe('roundProfile', () => {
  it('forex (5 dec) preserva precisión de pip', () => {
    expect(roundProfile(1.08543, profileFor('EUR/USD'))).toBe(1.08543);
  });

  it('equity (2 dec) redondea a cents', () => {
    expect(roundProfile(178.456, profileFor('AAPL'))).toBe(178.46);
  });

  it('crypto (2 dec) redondea precios grandes', () => {
    expect(roundProfile(56789.123, profileFor('BTC'))).toBe(56789.12);
  });
});
