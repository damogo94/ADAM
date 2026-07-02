/**
 * Tests para extractEstructuraTradeSummary (lib/analyses/trade-summary.ts) — el
 * trade PARALELO del agente de Estructura (MTF, futuros).
 *
 * Cubre:
 *   - null-safety: estructura_output null/undefined → null (opt-in apagado).
 *   - estado NO accionable (sin_estructura/esperando_zona/sin_setup) → null.
 *   - accionable buy ('compra') y sell ('venta') → trade con geometría válida,
 *     source:'estructura' y horizonte derivado de timeframe_entrada.
 *   - geometría degenerada/invertida → null (mismo guard que A3).
 */

import { describe, it, expect } from 'vitest';
import { extractEstructuraTradeSummary } from '../trade-summary';

/**
 * Fixture mínimo del `estructura_output` que necesita el extractor: `setup` +
 * `gestion`. El resto del EstructuraOutput no lo lee, así que se omite (el helper
 * es null-safe vía asRecord, no valida el schema completo).
 */
function makeEstructura(opts: {
  estado: string;
  direccion: string;
  timeframe_entrada: string | null;
  entrada: number;
  stop_loss: number;
  take_profit: number;
  ratio_riesgo_beneficio?: number | null;
}) {
  return {
    setup: {
      direccion: opts.direccion,
      timeframe_zona: '1D',
      timeframe_entrada: opts.timeframe_entrada,
      gatillo: 'ninguno',
      estado: opts.estado,
    },
    gestion: {
      entrada: opts.entrada,
      entry_type: 'limit',
      stop_loss: opts.stop_loss,
      take_profit: opts.take_profit,
      break_even_trigger: null,
      ratio_riesgo_beneficio: opts.ratio_riesgo_beneficio ?? 2,
    },
  };
}

describe('extractEstructuraTradeSummary — null-safety', () => {
  it('null → null (opt-in apagado)', () => {
    expect(extractEstructuraTradeSummary(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(extractEstructuraTradeSummary(undefined)).toBeNull();
  });

  it('objeto sin setup/gestion → null', () => {
    expect(extractEstructuraTradeSummary({})).toBeNull();
    expect(extractEstructuraTradeSummary({ setup: null, gestion: null })).toBeNull();
  });
});

describe('extractEstructuraTradeSummary — estado no accionable → null', () => {
  for (const estado of ['sin_estructura', 'esperando_zona', 'sin_setup']) {
    it(`estado="${estado}" → null`, () => {
      const out = makeEstructura({
        estado,
        direccion: 'compra',
        timeframe_entrada: '1H',
        entrada: 100,
        stop_loss: 95,
        take_profit: 115,
      });
      expect(extractEstructuraTradeSummary(out)).toBeNull();
    });
  }

  it('direccion="ninguno" con estado accionable → null (sin señal)', () => {
    const out = makeEstructura({
      estado: 'listo',
      direccion: 'ninguno',
      timeframe_entrada: '1D',
      entrada: 100,
      stop_loss: 95,
      take_profit: 115,
    });
    expect(extractEstructuraTradeSummary(out)).toBeNull();
  });
});

describe('extractEstructuraTradeSummary — accionable buy (compra)', () => {
  it("estado 'listo' + compra → trade LONG con source:'estructura' y horizonte por timeframe", () => {
    const out = makeEstructura({
      estado: 'listo',
      direccion: 'compra',
      timeframe_entrada: '1D', // → swing
      entrada: 100,
      stop_loss: 95,
      take_profit: 115,
      ratio_riesgo_beneficio: 3,
    });
    const t = extractEstructuraTradeSummary(out);
    expect(t).toEqual({
      signal: 'buy',
      entrada: 100,
      stop_loss: 95,
      target: 115,
      rb: 3,
      horizonte: 'swing',
      source: 'estructura',
    });
  });

  it("estado 'esperando_confirmacion' + compra también es accionable (plan con geometría)", () => {
    const out = makeEstructura({
      estado: 'esperando_confirmacion',
      direccion: 'compra',
      timeframe_entrada: '4H', // → intradia
      entrada: 50,
      stop_loss: 48,
      take_profit: 56,
    });
    const t = extractEstructuraTradeSummary(out);
    expect(t?.source).toBe('estructura');
    expect(t?.signal).toBe('buy');
    expect(t?.horizonte).toBe('intradia');
  });
});

describe('extractEstructuraTradeSummary — accionable sell (venta)', () => {
  it("estado 'listo' + venta → trade SHORT con horizonte posicional (1W)", () => {
    const out = makeEstructura({
      estado: 'listo',
      direccion: 'venta',
      timeframe_entrada: '1W', // → posicional
      entrada: 100,
      stop_loss: 105,
      take_profit: 85,
      ratio_riesgo_beneficio: 3,
    });
    const t = extractEstructuraTradeSummary(out);
    expect(t).toEqual({
      signal: 'sell',
      entrada: 100,
      stop_loss: 105,
      target: 85,
      rb: 3,
      horizonte: 'posicional',
      source: 'estructura',
    });
  });

  it('timeframe_entrada desconocido/null → horizonte null (trade sigue válido)', () => {
    const out = makeEstructura({
      estado: 'listo',
      direccion: 'venta',
      timeframe_entrada: null,
      entrada: 100,
      stop_loss: 105,
      take_profit: 85,
    });
    const t = extractEstructuraTradeSummary(out);
    expect(t?.signal).toBe('sell');
    expect(t?.horizonte).toBeNull();
  });
});

describe('extractEstructuraTradeSummary — geometría inválida → null', () => {
  it('compra con target por debajo de entrada (geometría invertida) → null', () => {
    const out = makeEstructura({
      estado: 'listo',
      direccion: 'compra',
      timeframe_entrada: '1D',
      entrada: 100,
      stop_loss: 95,
      take_profit: 90, // target < entrada pero señal buy → incoherente
    });
    expect(extractEstructuraTradeSummary(out)).toBeNull();
  });

  it('niveles degenerados (stop == entrada) → null', () => {
    const out = makeEstructura({
      estado: 'listo',
      direccion: 'compra',
      timeframe_entrada: '1D',
      entrada: 100,
      stop_loss: 100,
      take_profit: 115,
    });
    expect(extractEstructuraTradeSummary(out)).toBeNull();
  });

  it('take_profit no numérico (null) → null', () => {
    const out = {
      setup: {
        direccion: 'compra',
        timeframe_entrada: '1D',
        estado: 'listo',
      },
      gestion: {
        entrada: 100,
        stop_loss: 95,
        take_profit: null,
        ratio_riesgo_beneficio: 2,
      },
    };
    expect(extractEstructuraTradeSummary(out)).toBeNull();
  });
});
