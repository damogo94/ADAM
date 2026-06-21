import { describe, it, expect } from 'vitest';
import { computeEstructura } from '../compute';
import { EstructuraComputeSchema } from '../schema';
import { ALCISTA_EN_ZONA, BAJISTA_EN_ZONA } from './fixtures';

describe('computeEstructura — contrato y determinismo', () => {
  it('produce un output que valida contra el schema (sin narrative)', () => {
    const out = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(() => EstructuraComputeSchema.parse(out)).not.toThrow();
  });

  it('es determinista: mismo input → mismo output bit a bit', () => {
    const a = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    const b = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('incluye el disclaimer literal', () => {
    const out = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(out.disclaimer).toContain('Análisis educativo');
  });
});

describe('computeEstructura — lectura estructural (manual §1)', () => {
  // Los swings se leen del high/low de la vela (±0.2% del cierre), por eso
  // toBeCloseTo en vez de igualdad exacta con el valor del pivot.
  it('alcista: identifica penúltimo y último alto/bajo correctamente', () => {
    const { contexto } = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(contexto.daily.direccion).toBe('alcista');
    expect(contexto.daily.ultimo_alto!).toBeCloseTo(162, 0);
    expect(contexto.daily.penultimo_alto!).toBeCloseTo(140, 0);
    expect(contexto.daily.ultimo_alto!).toBeGreaterThan(contexto.daily.penultimo_alto!);
    expect(contexto.daily.fase).toBe('retroceso');
  });

  it('bajista: identifica la estructura invertida', () => {
    const { contexto } = computeEstructura({ ticker: 'TEST', ohlcv: BAJISTA_EN_ZONA });
    expect(contexto.daily.direccion).toBe('bajista');
    expect(contexto.daily.ultimo_bajo!).toBeCloseTo(40, 0);
    expect(contexto.daily.penultimo_bajo!).toBeCloseTo(60, 0);
    expect(contexto.daily.ultimo_bajo!).toBeLessThan(contexto.daily.penultimo_bajo!);
  });
});

describe('computeEstructura — rango operativo y zona (manual §1)', () => {
  it('alcista: zona de retesteo en el penúltimo alto', () => {
    const { rango_operativo } = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(rango_operativo.zona_retesteo!.nivel).toBeCloseTo(140, 0);
    expect(rango_operativo.desde!).toBeCloseTo(140, 0);
    expect(rango_operativo.hasta!).toBeCloseTo(162, 0);
  });
});

describe('computeEstructura — confluencia "Eje Y" (manual §3)', () => {
  it('Fase 1: sin datos de opciones, vanilla null y redondo como proxy', () => {
    const { confluencia } = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(confluencia.vanilla_disponible).toBe(false);
    expect(confluencia.barrera_vanilla).toBeNull();
    expect(confluencia.precio_redondo).not.toBeNull();
  });

  it('con muro vanilla coincidente: lo refleja y eleva la confluencia', () => {
    const sin = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    const con = computeEstructura({
      ticker: 'TEST',
      ohlcv: ALCISTA_EN_ZONA,
      vanillaWalls: [{ strike: 140, open_interest: 5000 }],
    });
    expect(con.confluencia.vanilla_disponible).toBe(true);
    expect(con.confluencia.barrera_vanilla).toBe(140);
    expect(con.confluencia.score).toBeGreaterThan(sin.confluencia.score);
  });
});

describe('computeEstructura — setup y gestión (manual §4-§6)', () => {
  it('alcista en zona → setup de compra con R/B ≥ 1.5 si hay plan', () => {
    const { setup, gestion } = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(setup.direccion).toBe('compra');
    if (gestion.ratio_riesgo_beneficio != null) {
      expect(gestion.ratio_riesgo_beneficio).toBeGreaterThanOrEqual(1.5);
      expect(gestion.stop_loss!).toBeLessThan(gestion.entrada!);
      expect(gestion.take_profit!).toBeGreaterThan(gestion.entrada!);
    }
  });

  it('bajista en zona → setup de venta', () => {
    const { setup } = computeEstructura({ ticker: 'TEST', ohlcv: BAJISTA_EN_ZONA });
    expect(setup.direccion).toBe('venta');
  });

  it('lateral / datos pobres → no inventa setup', () => {
    const flat = Array.from({ length: 40 }, (_, i) => ({
      t: 1_700_000_000 + i * 86_400,
      o: 100,
      h: 100.5,
      l: 99.5,
      c: 100,
      v: 1000,
    }));
    const { setup, gestion } = computeEstructura({ ticker: 'TEST', ohlcv: flat });
    expect(['esperando_zona', 'sin_setup', 'sin_estructura']).toContain(setup.estado);
    expect(gestion.entrada).toBeNull();
  });
});

describe('computeEstructura — aislamiento estructural (invariante)', () => {
  it('rechaza cualquier clave fuera de {ticker, ohlcv, intraday, vanillaWalls}', () => {
    expect(() =>
      // @ts-expect-error — campo prohibido a propósito
      computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA, news: ['x'] })
    ).toThrow(/isolation/i);
  });

  it('acepta intraday y vanillaWalls sin romper', () => {
    expect(() =>
      computeEstructura({
        ticker: 'TEST',
        ohlcv: ALCISTA_EN_ZONA,
        intraday: ALCISTA_EN_ZONA,
        vanillaWalls: [{ strike: 140 }],
      })
    ).not.toThrow();
  });
});
