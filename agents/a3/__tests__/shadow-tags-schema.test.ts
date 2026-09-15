/**
 * Shadow tags F1/F1'/F2 (plan precisión 2026-09, R11) — supervivencia por
 * AMBOS schemas de A3.
 *
 * Lección F8a (CLAUDE.md): `operativa` en agents/a3/schema.ts es strip-mode
 * (no-strict), así que un campo que exista en el compute y en shared/types.ts
 * pero falte allí se pierde EN SILENCIO en la ruta legacy runA3 — sin error
 * Zod ni test rojo. Este test fija que `veto_regimen` y `distancia_entrada_atr`
 * atraviesan los dos schemas, que siguen siendo nullable+optional (runs
 * antiguos validan) y que el LLM NO puede producirlas (A3NarrativeOnly es
 * strict y solo admite `narrative`): las marcas nacen del código, no del prompt.
 */

import { describe, it, expect } from 'vitest';
import { A3_OUTPUT_SCHEMA } from '../schema';
import { A3Output, A3NarrativeOnly } from '@/agents/shared/types';

function baseOutput(operativa: Record<string, unknown>) {
  return {
    ticker: 'TEST',
    timeframes_analizados: ['1D'],
    tendencia: { primaria: 'bajista', secundaria: 'lateral', fuerza: 3 },
    soportes: [90],
    resistencias: [104],
    patron_detectado: null,
    medias: {
      sma20: 101,
      sma50: 103,
      sma200: 95,
      vwap: 100.5,
      golden_cross: false,
      death_cross: false,
    },
    volumen: { estado: 'estable', comentario: 'volumen en línea con la media.' },
    velas_relevantes: [],
    operativa: {
      signal: 'sell',
      entrada: 104,
      stop_loss: 105,
      target: 90,
      atr_actual: 1,
      ratio_riesgo_beneficio: 14,
      horizonte: 'posicional',
      entry_type: 'limit',
      ...operativa,
    },
    factor_invalidacion: 'Cierre diario por encima de 105 invalida la tesis bajista.',
    confidence: 60,
    narrative:
      'Narrativa de prueba suficientemente larga para validar el schema de salida de A3.',
  };
}

describe('shadow tags — sobreviven al parse por AMBOS schemas de A3', () => {
  const tagged = baseOutput({ veto_regimen: true, distancia_entrada_atr: 4 });

  it('agents/a3/schema.ts (legacy, strip-mode) conserva veto_regimen y distancia_entrada_atr', () => {
    const parsed = A3_OUTPUT_SCHEMA.parse(tagged);
    expect(parsed.operativa.veto_regimen).toBe(true);
    expect(parsed.operativa.distancia_entrada_atr).toBe(4);
  });

  it('agents/shared/types.ts A3Output (strict) conserva veto_regimen y distancia_entrada_atr', () => {
    const parsed = A3Output.parse(tagged);
    expect(parsed.operativa.veto_regimen).toBe(true);
    expect(parsed.operativa.distancia_entrada_atr).toBe(4);
  });

  it('ambos schemas aceptan las marcas en null (hold / sin SMA200 / sin ATR)', () => {
    const nulled = baseOutput({ veto_regimen: null, distancia_entrada_atr: null });
    expect(A3_OUTPUT_SCHEMA.parse(nulled).operativa.veto_regimen).toBeNull();
    expect(A3Output.parse(nulled).operativa.distancia_entrada_atr).toBeNull();
  });

  it('ambos schemas aceptan la AUSENCIA de las marcas (runs anteriores persistidos)', () => {
    const legacy = baseOutput({});
    expect(() => A3_OUTPUT_SCHEMA.parse(legacy)).not.toThrow();
    expect(() => A3Output.parse(legacy)).not.toThrow();
    expect(A3Output.parse(legacy).operativa.veto_regimen).toBeUndefined();
  });

  it('ambos schemas rechazan tipos incorrectos (no se cuela un string como marca)', () => {
    const bad = baseOutput({ veto_regimen: 'true', distancia_entrada_atr: '4' });
    expect(() => A3_OUTPUT_SCHEMA.parse(bad)).toThrow();
    expect(() => A3Output.parse(bad)).toThrow();
  });

  it('las claves están declaradas en los DOS schemas de operativa (anti-deriva F8a)', () => {
    const legacyKeys = Object.keys(A3_OUTPUT_SCHEMA.shape.operativa.shape);
    const sharedKeys = Object.keys(A3Output.shape.operativa.shape);
    for (const k of ['veto_regimen', 'distancia_entrada_atr']) {
      expect(legacyKeys).toContain(k);
      expect(sharedKeys).toContain(k);
    }
  });
});

describe('shadow tags — el LLM NO las produce (nacen del código)', () => {
  it('A3NarrativeOnly no exige las marcas: {narrative} solo sigue validando', () => {
    expect(() =>
      A3NarrativeOnly.parse({
        narrative: 'Narrativa de prueba suficientemente larga para validar el schema.',
      })
    ).not.toThrow();
  });

  it('A3NarrativeOnly (strict) rechaza que el LLM intente inyectar las marcas', () => {
    expect(() =>
      A3NarrativeOnly.parse({
        narrative: 'Narrativa de prueba suficientemente larga para validar el schema.',
        veto_regimen: true,
      })
    ).toThrow();
  });
});
