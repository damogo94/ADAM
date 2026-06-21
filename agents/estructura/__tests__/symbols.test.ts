import { describe, it, expect } from 'vitest';
import { resolveEstructuraSymbol } from '../symbols';

describe('resolveEstructuraSymbol — nomenclatura de futuros', () => {
  it('XAUUSD → GC=F conservando el display del usuario', () => {
    expect(resolveEstructuraSymbol('XAUUSD')).toEqual({
      display: 'XAUUSD',
      dataSymbol: 'GC=F',
    });
  });

  it('NAS100 / US100 → NQ=F (case-insensitive)', () => {
    expect(resolveEstructuraSymbol('NAS100').dataSymbol).toBe('NQ=F');
    expect(resolveEstructuraSymbol('us100').dataSymbol).toBe('NQ=F');
    expect(resolveEstructuraSymbol('us100').display).toBe('US100');
  });

  it('cae al catálogo para alias conocidos (gold → GC=F)', () => {
    expect(resolveEstructuraSymbol('gold').dataSymbol).toBe('GC=F');
  });

  it('passthrough para tickers normales', () => {
    expect(resolveEstructuraSymbol('AAPL').dataSymbol).toBe('AAPL');
    expect(resolveEstructuraSymbol('BTC').dataSymbol).toBe('BTC');
  });
});
