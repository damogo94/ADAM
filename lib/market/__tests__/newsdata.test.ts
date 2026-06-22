/**
 * Tests de lib/market/newsdata — parte pura (normalización del artículo + age).
 * `normalizeNewsdataArticle` recibe `nowMs` para testear age sin Date.now().
 */

import { describe, it, expect } from 'vitest';
import { normalizeNewsdataArticle } from '../newsdata';

// 2026-06-22T00:00:00Z como "ahora" de referencia.
const NOW = Date.UTC(2026, 5, 22, 0, 0, 0);

describe('normalizeNewsdataArticle', () => {
  it('mapea título/fuente/url y calcula age desde pubDate UTC', () => {
    const item = normalizeNewsdataArticle(
      {
        title: 'BTC rompe resistencia',
        link: 'https://example.com/btc',
        source_name: 'Crypto Briefing',
        source_id: 'cryptobriefing',
        pubDate: '2026-06-21 18:00:00', // 6h antes de NOW
      },
      NOW,
    );
    expect(item).not.toBeNull();
    expect(item?.headline).toBe('BTC rompe resistencia');
    expect(item?.source).toBe('Crypto Briefing');
    expect(item?.url).toBe('https://example.com/btc');
    expect(item?.age_hours).toBe(6);
    expect(item?.published_iso).toBe('2026-06-21T18:00:00.000Z');
  });

  it('cae a source_id y luego al literal si falta el nombre', () => {
    expect(
      normalizeNewsdataArticle({ title: 'x', source_id: 'coindesk' }, NOW)?.source,
    ).toBe('coindesk');
    expect(normalizeNewsdataArticle({ title: 'x' }, NOW)?.source).toBe('newsdata.io');
  });

  it('age/iso null si pubDate falta o es inválida (no inventa fecha)', () => {
    const item = normalizeNewsdataArticle({ title: 'x', pubDate: 'no-fecha' }, NOW);
    expect(item?.age_hours).toBeNull();
    expect(item?.published_iso).toBeNull();
    expect(item?.publishedAt).toBeUndefined();
  });

  it('null si el artículo no tiene título', () => {
    expect(normalizeNewsdataArticle({ link: 'https://x' }, NOW)).toBeNull();
  });
});
