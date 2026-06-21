import { describe, it, expect } from 'vitest';
import { detectGatillo } from '../gatillo';
import { DOBLE_SUELO, DOBLE_TECHO, ALCISTA_EN_ZONA } from '../../__tests__/fixtures';

describe('gatillo — patrones de confirmación (manual §5)', () => {
  it('doble suelo + dirección compra → W', () => {
    expect(detectGatillo(DOBLE_SUELO, 'compra', null)).toBe('W');
  });

  it('doble techo + dirección venta → M', () => {
    expect(detectGatillo(DOBLE_TECHO, 'venta', null)).toBe('M');
  });

  it('vela de cuerpo fuerte que rompe el nivel → ruptura_impulso', () => {
    const base = ALCISTA_EN_ZONA.slice(0, -1);
    const last = { t: 1_800_000_000, o: 100, h: 121, l: 99.5, c: 120, v: 5000 };
    expect(detectGatillo([...base, last], 'compra', 110)).toBe('ruptura_impulso');
  });

  it('sin patrón ni ruptura → ninguno', () => {
    expect(detectGatillo(ALCISTA_EN_ZONA, 'compra', 99999)).toBe('ninguno');
  });

  it('dirección ninguno o pocas velas → ninguno', () => {
    expect(detectGatillo(ALCISTA_EN_ZONA, 'ninguno', 100)).toBe('ninguno');
    expect(detectGatillo(ALCISTA_EN_ZONA.slice(0, 3), 'compra', 100)).toBe('ninguno');
  });
});
