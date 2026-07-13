/**
 * Tests de los helpers puros de dirección (components/agent-primitives.tsx).
 *
 * normalizeDirection unifica los 5 vocabularios de enum de dirección de los
 * agentes; directionMeta es el SSOT del titular dirección→presentación (label +
 * color semántico de mercado) que consumen VerdictBar y el historial.
 */

import { describe, it, expect } from 'vitest';
import { normalizeDirection, directionMeta } from '../agent-primitives';

describe('normalizeDirection — unifica los vocabularios de dirección', () => {
  for (const up of ['positivo', 'alcista', 'risk_on', 'oportunidad', 'compra']) {
    it(`"${up}" → up`, () => expect(normalizeDirection(up)).toBe('up'));
  }
  for (const down of ['negativo', 'bajista', 'risk_off', 'vulnerabilidad', 'venta']) {
    it(`"${down}" → down`, () => expect(normalizeDirection(down)).toBe('down'));
  }
  for (const flat of ['neutral', 'lateral', 'anomalia', 'ninguno', null, undefined]) {
    it(`"${flat}" → flat`, () => expect(normalizeDirection(flat)).toBe('flat'));
  }
});

describe('directionMeta — label + color de mercado del titular', () => {
  it('alcista (up) → ALCISTA / text-emerald', () => {
    expect(directionMeta('positivo')).toEqual({ label: 'ALCISTA', cls: 'text-emerald' });
    expect(directionMeta('compra')).toEqual({ label: 'ALCISTA', cls: 'text-emerald' });
  });
  it('bajista (down) → BAJISTA / text-rose', () => {
    expect(directionMeta('negativo')).toEqual({ label: 'BAJISTA', cls: 'text-rose' });
    expect(directionMeta('venta')).toEqual({ label: 'BAJISTA', cls: 'text-rose' });
  });
  it('neutral (flat) → NEUTRAL / text-ink/70 (chrome, no color de mercado)', () => {
    expect(directionMeta('neutral')).toEqual({ label: 'NEUTRAL', cls: 'text-ink/70' });
    expect(directionMeta(null)).toEqual({ label: 'NEUTRAL', cls: 'text-ink/70' });
  });
});
