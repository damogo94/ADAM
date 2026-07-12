/**
 * Tests de agents/a3/compute/exhaustion.ts — HIPÓTESIS CONGELADA, NO VALIDADA.
 *
 * Propósito ÚNICO de este test: demostrar que la LÓGICA del detector dispara
 * cuando el patrón de blow-off EXISTE (fixture sintético), y no dispara en series
 * planas/bajistas. Así se prueba que el "0 disparos in-sample" de la investigación
 * 2026-07 es del DATO (la muestra bajista no tenía techos), no de un bug del código.
 * NO valida el poder predictivo del detector (eso requiere datos OOS — ver el
 * header de exhaustion.ts y docs/adr/0004).
 */
import { describe, it, expect } from 'vitest';
import { detectExhaustion } from '../exhaustion';
import type { OHLCVCandle_t } from '@/agents/shared/types';

const day = (i: number) => i * 86_400;

/** Blow-off sintético: base plana larga + tramo parabólico + vela clímax de rango
 *  amplio con cierre débil (rechazo). Debe cumplir contexto (sobre-extendido) +
 *  aceleración + expansión de rango + cierre débil. */
function blowOff(): OHLCVCandle_t[] {
  const c: OHLCVCandle_t[] = [];
  let price = 100;
  for (let i = 0; i < 55; i++) c.push({ t: day(i), o: price, h: price + 0.3, l: price - 0.3, c: price, v: 1000 });
  const rises = [3, 4, 6, 8, 10, 12, 9]; // pole parabólico con rango creciente
  for (let k = 0; k < rises.length; k++) {
    const o = price; price += rises[k]!;
    c.push({ t: day(55 + k), o, h: Math.max(o, price) + 1.5, l: Math.min(o, price) - 1.5, c: price, v: 1500 });
  }
  // Vela clímax: rango enorme, cierre en el 20% inferior (upper-wick de rechazo).
  const o = price;
  c.push({ t: day(62), o, h: price + 12, l: price - 3, c: price - 1, v: 2500 });
  return c;
}

function flat(n = 80): OHLCVCandle_t[] {
  return Array.from({ length: n }, (_, i) => ({ t: day(i), o: 100, h: 100.4, l: 99.6, c: 100, v: 1000 }));
}

function downtrend(n = 80): OHLCVCandle_t[] {
  return Array.from({ length: n }, (_, i) => {
    const p = 200 - i * 1; // baja ~50%
    return { t: day(i), o: p, h: p + 0.5, l: p - 0.5, c: p, v: 1000 };
  });
}

describe('detectExhaustion — la lógica dispara cuando el patrón EXISTE', () => {
  it('blow-off sintético (parabólico + clímax de cierre débil) → exhausted', () => {
    const r = detectExhaustion(blowOff());
    expect(r.exhausted).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(2);
    expect(r.overExtensionATR).toBeGreaterThanOrEqual(1.5);
  });

  it('serie plana → NO exhausted (no sobre-extendido)', () => {
    const r = detectExhaustion(flat());
    expect(r.exhausted).toBe(false);
  });

  it('tendencia bajista → NO exhausted (cotiza por debajo de su media)', () => {
    const r = detectExhaustion(downtrend());
    expect(r.exhausted).toBe(false);
    expect(r.overExtensionATR).toBeLessThan(0);
  });

  it('<60 velas → NO exhausted (datos insuficientes)', () => {
    expect(detectExhaustion(flat(40)).exhausted).toBe(false);
  });
});
