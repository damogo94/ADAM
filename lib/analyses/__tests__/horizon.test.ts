/**
 * Tests para lib/analyses/horizon.ts — SSOT de presentación del horizonte.
 *
 * Cubre:
 *   - horizonteLabel: los 3 mapeos (short + long), incluyendo que `posicional`
 *     NO diga literalmente "1 mes" a secas sino la etiqueta honesta ("≈1 mes+").
 *   - horizonteFromEstructuraTimeframe: cada timeframe válido (con normalización
 *     de mayúsculas), un caso null y un timeframe desconocido.
 */

import { describe, it, expect } from 'vitest';
import { horizonteLabel, horizonteFromEstructuraTimeframe } from '../horizon';

describe('horizonteLabel', () => {
  it('mapea intradia → { short: "1d", long: "1 día · intradía" }', () => {
    expect(horizonteLabel('intradia')).toEqual({ short: '1d', long: '1 día · intradía' });
  });

  it('mapea swing → { short: "7d", long: "1 semana · swing" }', () => {
    expect(horizonteLabel('swing')).toEqual({ short: '7d', long: '1 semana · swing' });
  });

  it('mapea posicional → { short: "1M", long: "posición · ≈1 mes+" }', () => {
    expect(horizonteLabel('posicional')).toEqual({ short: '1M', long: 'posición · ≈1 mes+' });
  });

  it('posicional es una etiqueta HONESTA — no dice literalmente "1 mes" a secas', () => {
    const { long } = horizonteLabel('posicional');
    // Debe llevar el matiz "≈" y el "+" (aproximado, no promesa exacta).
    expect(long).toContain('≈1 mes+');
    expect(long).not.toBe('1 mes');
    expect(long).not.toMatch(/^1 mes$/);
  });
});

describe('horizonteFromEstructuraTimeframe', () => {
  it('1H → intradia', () => {
    expect(horizonteFromEstructuraTimeframe('1H')).toBe('intradia');
  });

  it('4H → intradia', () => {
    expect(horizonteFromEstructuraTimeframe('4H')).toBe('intradia');
  });

  it('1D → swing', () => {
    expect(horizonteFromEstructuraTimeframe('1D')).toBe('swing');
  });

  it('1W → posicional', () => {
    expect(horizonteFromEstructuraTimeframe('1W')).toBe('posicional');
  });

  it('normaliza mayúsculas/minúsculas (1h → intradia, 1w → posicional)', () => {
    expect(horizonteFromEstructuraTimeframe('1h')).toBe('intradia');
    expect(horizonteFromEstructuraTimeframe('4h')).toBe('intradia');
    expect(horizonteFromEstructuraTimeframe('1d')).toBe('swing');
    expect(horizonteFromEstructuraTimeframe('1w')).toBe('posicional');
  });

  it('null → null', () => {
    expect(horizonteFromEstructuraTimeframe(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(horizonteFromEstructuraTimeframe(undefined)).toBeNull();
  });

  it('timeframe desconocido → null', () => {
    expect(horizonteFromEstructuraTimeframe('30m')).toBeNull();
    expect(horizonteFromEstructuraTimeframe('')).toBeNull();
    expect(horizonteFromEstructuraTimeframe('2D')).toBeNull();
  });
});
