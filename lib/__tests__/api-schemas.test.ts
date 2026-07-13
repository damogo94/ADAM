/**
 * Tests del SSOT de validación de tickers de la API (lib/api-schemas.ts).
 *
 * Contrato transversal: el mismo activo debe pasar por TODOS los endpoints. El
 * charset incluye los caracteres que ya causaron incidentes reales (`=` de GC=F,
 * `^` de índices, `/` de pares forex, `-` de BTC-USD, `.` de BRK.B).
 */

import { describe, it, expect } from 'vitest';
import { TICKER_REGEX, TickerField } from '../api-schemas';

describe('TICKER_REGEX — charset del contrato', () => {
  for (const ok of ['AAPL', 'BTC-USD', 'EUR/USD', 'BRK.B', 'GC=F', '^GSPC', 'NQ=F']) {
    it(`acepta "${ok}"`, () => {
      expect(TICKER_REGEX.test(ok)).toBe(true);
    });
  }

  for (const bad of ['AA PL', 'DROP;', 'a{b}', '<script>', '']) {
    it(`rechaza "${bad}"`, () => {
      expect(TICKER_REGEX.test(bad)).toBe(false);
    });
  }
});

describe('TickerField — normalización + validación', () => {
  it('normaliza a mayúsculas', () => {
    expect(TickerField.parse('aapl')).toBe('AAPL');
    expect(TickerField.parse('gc=f')).toBe('GC=F');
  });

  it('acepta GC=F (el incidente de prod) y otros símbolos con chars especiales', () => {
    expect(TickerField.parse('GC=F')).toBe('GC=F');
    expect(TickerField.parse('btc-usd')).toBe('BTC-USD');
    expect(TickerField.parse('eur/usd')).toBe('EUR/USD');
  });

  it('rechaza vacío, >20 chars e inyección', () => {
    expect(TickerField.safeParse('').success).toBe(false);
    expect(TickerField.safeParse('A'.repeat(21)).success).toBe(false);
    expect(TickerField.safeParse('drop; table').success).toBe(false);
  });
});
