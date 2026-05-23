import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeStale, getStaleHours } from '../compute-stale';

describe('computeStale', () => {
  const NOW = new Date('2026-05-23T12:00:00Z');

  it('lastAnalysisAt null o undefined → stale true (sin análisis = viejo)', () => {
    expect(computeStale(null, NOW)).toBe(true);
    expect(computeStale(undefined, NOW)).toBe(true);
  });

  it('analizado hace 1h → fresh (default 24h)', () => {
    const oneHourAgo = new Date(NOW.getTime() - 1 * 3600 * 1000).toISOString();
    expect(computeStale(oneHourAgo, NOW)).toBe(false);
  });

  it('analizado hace 23h59m → fresh (justo bajo el umbral 24h)', () => {
    const just = new Date(NOW.getTime() - (23 * 60 + 59) * 60 * 1000).toISOString();
    expect(computeStale(just, NOW)).toBe(false);
  });

  it('analizado hace 25h → stale (sobre el umbral)', () => {
    const past = new Date(NOW.getTime() - 25 * 3600 * 1000).toISOString();
    expect(computeStale(past, NOW)).toBe(true);
  });

  it('timestamp invalido → stale true (defensive)', () => {
    expect(computeStale('not-a-date', NOW)).toBe(true);
  });

  it('timestamp en el FUTURO → fresh (clock skew tolerado)', () => {
    const future = new Date(NOW.getTime() + 60 * 1000).toISOString();
    expect(computeStale(future, NOW)).toBe(false);
  });
});

describe('getStaleHours', () => {
  const originalEnv = process.env.STALE_HOURS;

  beforeEach(() => {
    delete process.env.STALE_HOURS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.STALE_HOURS;
    else process.env.STALE_HOURS = originalEnv;
  });

  it('sin env → default 24', () => {
    expect(getStaleHours()).toBe(24);
  });

  it('env válida → respeta el valor', () => {
    process.env.STALE_HOURS = '6';
    expect(getStaleHours()).toBe(6);
  });

  it('env inválida → fallback a default 24', () => {
    process.env.STALE_HOURS = 'banana';
    expect(getStaleHours()).toBe(24);
  });

  it('env <= 0 → fallback a default 24', () => {
    process.env.STALE_HOURS = '-5';
    expect(getStaleHours()).toBe(24);
  });
});
