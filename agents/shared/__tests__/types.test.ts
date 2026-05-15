/**
 * Tests para agents/shared/types.ts
 *
 * Cubre:
 *   - Ejemplos válidos parsean OK para los 6 schemas (A1, A2, A3, A4, Debate, CMT)
 *   - Ejemplos inválidos lanzan error claro (campos extra, tipos malos, fuera de rango)
 *   - .strict() rechaza campos no declarados
 *   - Enums compartidos validan sus valores y rechazan los demás
 *   - DISCLAIMER_LITERAL es exactamente el string esperado (no aceptamos
 *     variaciones del modelo)
 */

import { describe, it, expect } from 'vitest';
import {
  A1Output,
  A2Output,
  A3Output,
  A4Output,
  DebateOutput,
  CMTOutput,
  ConfluenceResult,
  Currency,
  AssetType,
  Direction,
  Confidence,
  Signal,
  DISCLAIMER_LITERAL,
  AGENT_SCHEMAS,
} from '../types';

// ───────────────────────────────────────────────────────────────────────────
// Fixtures válidos
// ───────────────────────────────────────────────────────────────────────────

const validA1 = {
  ticker: 'AAPL',
  asset_type: 'equity' as const,
  price: {
    current: 198.5,
    change_pct_24h: 1.2,
    change_pct_7d: -2.3,
    currency: 'USD' as const,
  },
  fundamentals: {
    per: 28.5,
    peg: 2.1,
    ev_ebitda: 22.3,
    fcf_yield_pct: 3.8,
    dividend_yield_pct: 0.5,
    market_cap_usd: 3_000_000_000_000,
  },
  news: [
    {
      headline: 'Apple beats Q3 expectations',
      source: 'Bloomberg',
      sentiment: 'bullish' as const,
      relevance: 4,
    },
  ],
  anomaly_detected: false,
  anomaly_type: null,
  anomaly_description: 'Activo en línea con expectativas sectoriales.',
  confidence: 65,
  narrative:
    'AAPL cotiza con PER 28.5 vs sectorial 24, prima del 19%. Earnings recientes baten, sin catalizadores adversos a 48h.',
};

const validA2 = {
  ticker: 'AAPL',
  macro_context: {
    ciclo_economico: 'expansion' as const,
    regimen_tipos: 'pausa' as const,
    inflacion_trend: 'bajando' as const,
    fed_funds_rate_pct: 4.5,
    us_10y_yield_pct: 4.1,
    narrative: 'Régimen de tipos en pausa con inflación desacelerando hacia objetivo.',
  },
  factores_clave: [],
  correlaciones: [],
  prevision: {
    horizonte: '1Y' as const,
    rango_esperado: 'Equity USA +5/+12%',
    factor_invalidante: 'Recesión técnica con caída de empleo > 3 meses',
  },
  opportunity_detected: false,
  opportunity_description: null,
  confidence: 60,
  narrative: 'Macro favorable a equity USA en horizonte 1Y, con riesgo de cola en hard landing.',
};

const validA3 = {
  ticker: 'AAPL',
  timeframes_analizados: ['1D'],
  tendencia: { primaria: 'alcista' as const, secundaria: 'lateral' as const, fuerza: 3 },
  soportes: [190, 185],
  resistencias: [205, 210],
  patron_detectado: null,
  medias: {
    sma20: 197.0,
    sma50: 193.5,
    sma200: 180.2,
    vwap: 197.8,
    golden_cross: false,
    death_cross: false,
  },
  volumen: { estado: 'estable' as const, comentario: 'Volumen en línea con promedio 20D.' },
  velas_relevantes: [],
  operativa: {
    signal: 'hold' as const,
    entrada: null,
    stop_loss: null,
    target: null,
    atr_actual: 3.2,
    ratio_riesgo_beneficio: null,
    horizonte: 'swing' as const,
  },
  factor_invalidacion: 'Pérdida del soporte 185 con volumen >150% promedio.',
  confidence: 55,
  narrative: 'AAPL en tendencia alcista de fondo con consolidación reciente. Operativa hold hasta confirmación.',
};

const validConfluence = {
  a3_solo: { score: 50, nivel: 'baja' as const },
  a1_a2: { score: 60, nivel: 'media' as const },
  alineados: { score: 0, nivel: 'baja' as const },
  score_total_pct: 39,
  nivel_final: 'media' as const,
};

const validA4 = {
  ticker: 'AAPL',
  confluence: validConfluence,
  resumen_a1: 'A1 sin anomalías, valoración en prima del 19% vs sectorial.',
  resumen_a2: 'Macro favorable, régimen de tipos en pausa.',
  resumen_a3: 'A3 hold, tendencia alcista sin trigger inmediato.',
  direccion: 'neutral' as const,
  confianza: 'media' as const,
  accion_sugerida:
    'Esperar test del soporte 190 antes de evaluar entrada. Sin confluencia plena para tomar acción operativa hoy.',
  riesgo_clave: 'Pérdida del soporte 185 invalidaría la tesis alcista de fondo.',
  disclaimer: DISCLAIMER_LITERAL,
};

const validDebate = {
  ticker: 'AAPL',
  convergence_score: 70,
  argumento_a1: 'A1 sostiene que la valoración está cara pero los fundamentales mejoran.',
  argumento_a2: 'A2 sostiene que la macro favorece al sector a 1Y.',
  puntos_convergencia: ['Ambos ven sector tech en expansión'],
  puntos_divergencia: ['A1 valora cara, A2 ve descuento implícito'],
  punto_critico_de_debate: '¿La prima sectorial está justificada por la macro de tipos a la baja?',
  oportunidad_validada: true,
  direccion: 'alcista' as const,
  horizonte_relevante: '3-6 meses',
  recomendacion_consolidada:
    'Acumular en pullbacks técnicos hacia el soporte 185. La macro respalda la tesis alcista en horizonte trimestral.',
  factor_invalidante: 'Cambio de forward guidance Fed hacia subidas adicionales.',
};

const validCMT = {
  ticker: 'AAPL',
  level: 'monitorear' as const,
  timeframe: '1D',
  setup_detected: 'Consolidación en triángulo simétrico cerca de resistencia 205.',
  confidence_pct: 60,
  entry_price: 199,
  stop_loss: 194,
  target_price: 212,
  risk_reward_ratio: 2.6,
  indicators: { sma50: 'precio sobre media', rsi: 'neutro' },
  invalidation_factor: 'Cierre diario bajo 190.',
};

// ───────────────────────────────────────────────────────────────────────────
// Enums compartidos
// ───────────────────────────────────────────────────────────────────────────

describe('enums compartidos', () => {
  it('Currency acepta códigos válidos y rechaza basura', () => {
    expect(Currency.parse('USD')).toBe('USD');
    expect(Currency.parse('USDT')).toBe('USDT');
    expect(() => Currency.parse('XXX')).toThrow();
  });

  it('AssetType cubre los 6 tipos del producto', () => {
    expect(AssetType.parse('equity')).toBe('equity');
    expect(AssetType.parse('crypto')).toBe('crypto');
    expect(() => AssetType.parse('nft')).toThrow();
  });

  it('Direction / Confidence / Signal validan sus valores estrechos', () => {
    expect(Direction.parse('positivo')).toBe('positivo');
    expect(Confidence.parse('alta')).toBe('alta');
    expect(Signal.parse('hold')).toBe('hold');
    expect(() => Direction.parse('bullish')).toThrow();
    expect(() => Confidence.parse('low')).toThrow();
    expect(() => Signal.parse('long')).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Schemas válidos parsean
// ───────────────────────────────────────────────────────────────────────────

describe('schemas — fixtures válidos parsean OK', () => {
  it('A1Output válido', () => {
    expect(() => A1Output.parse(validA1)).not.toThrow();
  });
  it('A2Output válido', () => {
    expect(() => A2Output.parse(validA2)).not.toThrow();
  });
  it('A3Output válido', () => {
    expect(() => A3Output.parse(validA3)).not.toThrow();
  });
  it('A4Output válido', () => {
    expect(() => A4Output.parse(validA4)).not.toThrow();
  });
  it('DebateOutput válido', () => {
    expect(() => DebateOutput.parse(validDebate)).not.toThrow();
  });
  it('CMTOutput válido', () => {
    expect(() => CMTOutput.parse(validCMT)).not.toThrow();
  });
  it('ConfluenceResult válido', () => {
    expect(() => ConfluenceResult.parse(validConfluence)).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// .strict() rechaza campos extra
// ───────────────────────────────────────────────────────────────────────────

describe('schemas — .strict() rechaza campos extra', () => {
  it('A1Output rechaza campo "extra"', () => {
    const bad = { ...validA1, surprise: 'gotcha' };
    expect(() => A1Output.parse(bad)).toThrow(/unrecognized|Unrecognized/);
  });

  it('A4Output rechaza campo extra en confluence', () => {
    const bad = {
      ...validA4,
      confluence: { ...validConfluence, extra: 1 },
    };
    expect(() => A4Output.parse(bad)).toThrow();
  });

  it('CMTOutput rechaza campo extra dentro de indicators NO — porque es record', () => {
    // indicators es z.record() → permite cualquier key. Validación: máximo 5 keys.
    const ok = { ...validCMT, indicators: { a: '1', b: '2', c: '3', d: '4', e: '5' } };
    expect(() => CMTOutput.parse(ok)).not.toThrow();
    const bad = { ...validCMT, indicators: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' } };
    expect(() => CMTOutput.parse(bad)).toThrow(/máximo 5/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Schemas — invalid lanza con mensaje claro
// ───────────────────────────────────────────────────────────────────────────

describe('schemas — fixtures inválidos lanzan errores claros', () => {
  it('A1 con confidence fuera de rango', () => {
    const bad = { ...validA1, confidence: 150 };
    expect(() => A1Output.parse(bad)).toThrow();
  });

  it('A1 con narrative > 2500 chars', () => {
    const bad = { ...validA1, narrative: 'x'.repeat(2501) };
    expect(() => A1Output.parse(bad)).toThrow();
  });

  it('A1 con sentiment fuera de enum', () => {
    const bad = {
      ...validA1,
      news: [{ ...validA1.news[0], sentiment: 'mixed' }],
    };
    expect(() => A1Output.parse(bad)).toThrow();
  });

  it('A4 con disclaimer ligeramente distinto (sin punto medio · ) falla', () => {
    const bad = {
      ...validA4,
      disclaimer: 'Análisis educativo - no constituye asesoramiento financiero regulado',
    };
    expect(() => A4Output.parse(bad)).toThrow();
  });

  it('A3 con tendencia.fuerza > 5 falla', () => {
    const bad = { ...validA3, tendencia: { ...validA3.tendencia, fuerza: 6 } };
    expect(() => A3Output.parse(bad)).toThrow();
  });

  it('ConfluenceResult con a3_solo.nivel != "baja" falla (literal por diseño)', () => {
    const bad = { ...validConfluence, a3_solo: { score: 90, nivel: 'alta' } };
    expect(() => ConfluenceResult.parse(bad)).toThrow();
  });

  it('Debate con argumento_a1 < 20 chars falla', () => {
    const bad = { ...validDebate, argumento_a1: 'corto' };
    expect(() => DebateOutput.parse(bad)).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AGENT_SCHEMAS lookup
// ───────────────────────────────────────────────────────────────────────────

describe('AGENT_SCHEMAS', () => {
  it('expone los 6 schemas por nombre', () => {
    expect(AGENT_SCHEMAS.A1).toBeDefined();
    expect(AGENT_SCHEMAS.A2).toBeDefined();
    expect(AGENT_SCHEMAS.A3).toBeDefined();
    expect(AGENT_SCHEMAS.A4).toBeDefined();
    expect(AGENT_SCHEMAS.DEBATE).toBeDefined();
    expect(AGENT_SCHEMAS.CMT).toBeDefined();
  });

  it('cada schema valida su fixture correspondiente vía lookup', () => {
    expect(() => AGENT_SCHEMAS.A1.parse(validA1)).not.toThrow();
    expect(() => AGENT_SCHEMAS.A4.parse(validA4)).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DISCLAIMER_LITERAL: regression test contra cambios accidentales
// ───────────────────────────────────────────────────────────────────────────

describe('DISCLAIMER_LITERAL', () => {
  it('usa el separador U+00B7 (middle dot) entre las dos cláusulas', () => {
    expect(DISCLAIMER_LITERAL).toBe(
      'Análisis educativo · no constituye asesoramiento financiero regulado'
    );
    // Verifica que el separador es exactamente · (no - ni ni :)
    expect(DISCLAIMER_LITERAL.charCodeAt(19)).toBe(0x00b7);
  });
});
