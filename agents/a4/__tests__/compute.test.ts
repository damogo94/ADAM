/**
 * Tests para agents/a4/compute.ts
 *
 * Cubre los acceptance criteria del plan §5 Tarea 1.4:
 *   1. Tests unitarios cubren: 4 agentes vivos (a1+a2+a3+debate), 3, 2, 1, 0
 *   2. Tests cubren las "Reglas de no-contradicción" del A4 §8:
 *      - Si nivel_final = "baja" → nivel_final categórico baja (consistencia)
 *      - Si algún agente falló (alive < 3) → cap a media o inferior
 *      - Si A3 hold + A1/A2 alcista → alignment bajo
 *   3. Mismo input → mismo output, siempre
 */

import { describe, it, expect } from 'vitest';
import {
  computeConfluence,
  scoreA3Solo,
  scoreA1A2,
  scoreAlignment,
  levelFromScore,
  ALIVE_CAPS,
  WEIGHT_A3_SOLO,
  WEIGHT_A1_A2,
  WEIGHT_ALIGN,
  type DebateForConfluence,
} from '../compute';
import type { A1Output_t, A2Output_t, A3Output_t } from '@/agents/shared/types';

// ───────────────────────────────────────────────────────────────────────────
// Fixtures helpers — agentes mínimos válidos
// ───────────────────────────────────────────────────────────────────────────

function mkA1(overrides: Partial<A1Output_t> = {}): A1Output_t {
  return {
    ticker: 'TEST',
    asset_type: 'equity',
    price: { current: 100, change_pct_24h: 0, change_pct_7d: 0, currency: 'USD' },
    fundamentals: {
      per: null,
      peg: null,
      ev_ebitda: null,
      fcf_yield_pct: null,
      dividend_yield_pct: null,
      market_cap_usd: null,
    },
    news: [],
    anomaly_detected: false,
    anomaly_type: null,
    anomaly_description: 'sin anomalía',
    confidence: 50,
    narrative: 'narrativa de prueba con suficiente longitud para validar.',
    ...overrides,
  };
}

function mkA2(overrides: Partial<A2Output_t> = {}): A2Output_t {
  return {
    ticker: 'TEST',
    macro_context: {
      ciclo_economico: 'expansion',
      regimen_tipos: 'pausa',
      inflacion_trend: 'estable',
      fed_funds_rate_pct: null,
      us_10y_yield_pct: null,
      narrative: 'régimen macro estable suficientemente largo.',
    },
    factores_clave: [],
    correlaciones: [],
    prevision: { horizonte: '1Y', rango_esperado: 'rango', factor_invalidante: 'factor' },
    opportunity_detected: false,
    opportunity_description: null,
    confidence: 50,
    narrative: 'narrativa A2 suficientemente larga para validar.',
    ...overrides,
  };
}

function mkA3(overrides: Partial<A3Output_t> = {}): A3Output_t {
  return {
    ticker: 'TEST',
    timeframes_analizados: ['1D'],
    tendencia: { primaria: 'lateral', secundaria: 'lateral', fuerza: 1 },
    soportes: [],
    resistencias: [],
    patron_detectado: null,
    medias: {
      sma20: null,
      sma50: null,
      sma200: null,
      vwap: null,
      golden_cross: false,
      death_cross: false,
    },
    volumen: { estado: 'estable', comentario: 'volumen ok' },
    velas_relevantes: [],
    operativa: {
      signal: 'hold',
      entrada: null,
      stop_loss: null,
      target: null,
      atr_actual: null,
      ratio_riesgo_beneficio: null,
      horizonte: 'swing',
    },
    factor_invalidacion: 'factor de invalidación de prueba.',
    confidence: 50,
    narrative: 'narrativa A3 suficientemente larga para validar.',
    ...overrides,
  };
}

function mkDebate(overrides: Partial<DebateForConfluence> = {}): DebateForConfluence {
  return { convergence_score: 70, direccion: 'alcista', ...overrides };
}

// ───────────────────────────────────────────────────────────────────────────
// scoreA3Solo — decisión §1: usar a3.confidence directamente
// ───────────────────────────────────────────────────────────────────────────

describe('scoreA3Solo', () => {
  it('null → 0', () => {
    expect(scoreA3Solo(null)).toBe(0);
  });
  it('confidence 80 → 80', () => {
    expect(scoreA3Solo(mkA3({ confidence: 80 }))).toBe(80);
  });
  it('confidence 0 → 0', () => {
    expect(scoreA3Solo(mkA3({ confidence: 0 }))).toBe(0);
  });
  it('confidence 100 → 100', () => {
    expect(scoreA3Solo(mkA3({ confidence: 100 }))).toBe(100);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// scoreA1A2 — los 3 escenarios + edge cases
// ───────────────────────────────────────────────────────────────────────────

describe('scoreA1A2', () => {
  it('ambos null + sin debate → 0', () => {
    expect(scoreA1A2(null, null, null)).toBe(0);
  });

  it('solo a1 vivo (sin debate) → confidence × 0.33', () => {
    const r = scoreA1A2(mkA1({ confidence: 90 }), null, null);
    expect(r).toBe(Math.round(90 * 0.33));
  });

  it('solo a2 vivo (sin debate) → confidence × 0.33', () => {
    const r = scoreA1A2(null, mkA2({ confidence: 60 }), null);
    expect(r).toBe(Math.round(60 * 0.33));
  });

  it('ambos vivos sin debate, mismo signal → avg × 0.5', () => {
    const r = scoreA1A2(
      mkA1({ confidence: 80, anomaly_detected: false }),
      mkA2({ confidence: 60, opportunity_detected: false }),
      null
    );
    // avg = 70, agreement = 1.0, half-weight = 70 * 1 * 0.5 = 35
    expect(r).toBe(35);
  });

  it('ambos vivos sin debate, signals divergentes → penalización 0.6', () => {
    const r = scoreA1A2(
      mkA1({ confidence: 80, anomaly_detected: true }),
      mkA2({ confidence: 60, opportunity_detected: false }), // divergente
      null
    );
    // avg = 70, agreement = 0.6, half = 70 * 0.6 * 0.5 = 21
    expect(r).toBe(21);
  });

  it('con debate + ambos vivos → conv × combined / 100', () => {
    const r = scoreA1A2(
      mkA1({ confidence: 80 }),
      mkA2({ confidence: 60 }),
      mkDebate({ convergence_score: 80 })
    );
    // conv 80, combined 70 → 80 * 70 / 100 = 56
    expect(r).toBe(56);
  });

  it('con debate pero solo a1 vivo → no usa debate, cae a single-agent path', () => {
    // Diseño: el debate solo aporta valor cuando hay 2 agentes que confrontar
    const r = scoreA1A2(mkA1({ confidence: 90 }), null, mkDebate());
    expect(r).toBe(Math.round(90 * 0.33));
  });

  it('confidences 100/100 con debate 100 → 100 (límite superior)', () => {
    expect(
      scoreA1A2(
        mkA1({ confidence: 100 }),
        mkA2({ confidence: 100 }),
        mkDebate({ convergence_score: 100 })
      )
    ).toBe(100);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// scoreAlignment — gradual scoring (decisión §3 acordada)
// ───────────────────────────────────────────────────────────────────────────

describe('scoreAlignment', () => {
  it('todos null → 0', () => {
    expect(scoreAlignment(null, null, null)).toBe(0);
  });

  it('3 agentes alineados alcista → 100', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'oportunidad' }),
      mkA2({ opportunity_detected: true }),
      mkA3({ operativa: { ...mkA3().operativa, signal: 'buy' } })
    );
    expect(r).toBe(100);
  });

  it('3 agentes, split 2 alcista 1 bajista → 30 (ruido)', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'oportunidad' }),
      mkA2({ opportunity_detected: true }),
      mkA3({ operativa: { ...mkA3().operativa, signal: 'sell' } })
    );
    expect(r).toBe(30);
  });

  it('2 agentes opinando, ambos alcista (1 neutro) → 70', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'oportunidad' }),
      mkA2({ opportunity_detected: false }), // neutro
      mkA3({ operativa: { ...mkA3().operativa, signal: 'buy' } })
    );
    expect(r).toBe(70);
  });

  it('2 opinando, discrepan → 0', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'vulnerabilidad' }), // bajista
      mkA2({ opportunity_detected: false }), // neutro
      mkA3({ operativa: { ...mkA3().operativa, signal: 'buy' } }) // alcista
    );
    expect(r).toBe(0);
  });

  it('1 solo opinando → 30 (opinión solitaria, no alignment)', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'oportunidad' }),
      mkA2({ opportunity_detected: false }),
      mkA3({ operativa: { ...mkA3().operativa, signal: 'hold' } })
    );
    expect(r).toBe(30);
  });

  it('A1 con anomaly_type "anomalia" se considera neutral (ambigua por diseño)', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'anomalia' }),
      mkA2({ opportunity_detected: false }),
      mkA3({ operativa: { ...mkA3().operativa, signal: 'hold' } })
    );
    expect(r).toBe(0); // nadie opina con dirección
  });

  // ── regime_outlook (nuevo) ──────────────────────────────────────────────
  it('A2 con regime_outlook="risk_off" + A1 vulnerabilidad + A3 sell → 100 (bajista alineado)', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'vulnerabilidad' }),
      mkA2({ opportunity_detected: false, regime_outlook: 'risk_off' }),
      mkA3({ operativa: { ...mkA3().operativa, signal: 'sell' } })
    );
    // Antes del fix esto daba 70 (A2 era neutral forzado). Con regime_outlook
    // los 3 votan bajista → 100. Resuelve la asimetría estructural.
    expect(r).toBe(100);
  });

  it('A2 con regime_outlook="risk_on" override opportunity_detected=false', () => {
    const r = scoreAlignment(
      mkA1({ anomaly_detected: true, anomaly_type: 'oportunidad' }),
      mkA2({ opportunity_detected: false, regime_outlook: 'risk_on' }),
      mkA3({ operativa: { ...mkA3().operativa, signal: 'buy' } })
    );
    expect(r).toBe(100);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// computeConfluence — escenarios end-to-end
// ───────────────────────────────────────────────────────────────────────────

describe('computeConfluence — escenarios de agentes vivos', () => {
  it('4 vivos (A1+A2+A3+Debate) con todo alto → score alto, nivel alta', () => {
    const r = computeConfluence({
      a1: mkA1({ confidence: 90, anomaly_detected: true, anomaly_type: 'oportunidad' }),
      a2: mkA2({ confidence: 90, opportunity_detected: true }),
      a3: mkA3({
        confidence: 90,
        operativa: { ...mkA3().operativa, signal: 'buy' },
      }),
      debate: mkDebate({ convergence_score: 90, direccion: 'alcista' }),
    });
    expect(r.score_total_pct).toBeGreaterThanOrEqual(67);
    expect(r.nivel_final).toBe('alta');
  });

  it('3 vivos sin debate → puede ser alta, no hay cap', () => {
    const r = computeConfluence({
      a1: mkA1({ confidence: 90, anomaly_detected: true, anomaly_type: 'oportunidad' }),
      a2: mkA2({ confidence: 90, opportunity_detected: true }),
      a3: mkA3({
        confidence: 90,
        operativa: { ...mkA3().operativa, signal: 'buy' },
      }),
      debate: null,
    });
    // Sin debate, a1_a2 ya está penalizado en 0.5, así que probablemente "media"
    // pero NO está cappeado por aliveCount.
    expect(r.score_total_pct).toBeLessThanOrEqual(100);
    expect(['media', 'alta']).toContain(r.nivel_final);
  });

  it('2 vivos → cap a 66 → máx "media"', () => {
    const r = computeConfluence({
      a1: mkA1({ confidence: 100, anomaly_detected: true, anomaly_type: 'oportunidad' }),
      a2: mkA2({ confidence: 100, opportunity_detected: true }),
      a3: null,
      debate: null,
    });
    expect(r.score_total_pct).toBeLessThanOrEqual(ALIVE_CAPS[2]);
    expect(r.nivel_final).not.toBe('alta');
  });

  it('1 vivo → cap a 33 → máx "baja"', () => {
    const r = computeConfluence({
      a1: null,
      a2: null,
      a3: mkA3({
        confidence: 100,
        operativa: { ...mkA3().operativa, signal: 'buy' },
      }),
      debate: null,
    });
    expect(r.score_total_pct).toBeLessThanOrEqual(ALIVE_CAPS[1]);
    expect(r.nivel_final).toBe('baja');
  });

  it('0 vivos → total 0', () => {
    const r = computeConfluence({ a1: null, a2: null, a3: null, debate: null });
    expect(r.score_total_pct).toBe(0);
    expect(r.nivel_final).toBe('baja');
  });
});

describe('computeConfluence — reglas de no-contradicción A4 §8', () => {
  it('A3 hold + A1/A2 alcista → alignment bajo → nivel_final no llega a alta', () => {
    const r = computeConfluence({
      a1: mkA1({ confidence: 90, anomaly_detected: true, anomaly_type: 'oportunidad' }),
      a2: mkA2({ confidence: 90, opportunity_detected: true }),
      a3: mkA3({
        confidence: 30,
        operativa: { ...mkA3().operativa, signal: 'hold' },
      }),
      debate: mkDebate({ convergence_score: 90, direccion: 'alcista' }),
    });
    // A3 dice hold (neutral). Solo A1+A2 opinan alcista (2 con dirección, dominante 2).
    // → alignment = 70 (no 100).
    expect(r.alineados.score).toBeLessThanOrEqual(70);
  });

  it('A3 con confidence 0 → a3_solo.score = 0', () => {
    const r = computeConfluence({
      a1: mkA1(),
      a2: mkA2(),
      a3: mkA3({ confidence: 0 }),
      debate: null,
    });
    expect(r.a3_solo.score).toBe(0);
    expect(r.a3_solo.nivel).toBe('baja'); // literal por diseño
  });

  it('a3_solo.nivel SIEMPRE es "baja" (literal por diseño)', () => {
    const cases = [
      { a3: mkA3({ confidence: 0 }) },
      { a3: mkA3({ confidence: 50 }) },
      { a3: mkA3({ confidence: 100 }) },
    ];
    for (const c of cases) {
      const r = computeConfluence({ a1: null, a2: null, ...c, debate: null });
      expect(r.a3_solo.nivel).toBe('baja');
    }
  });

  it('Score total CLAMPED a 0-100 incluso con valores extremos', () => {
    const r = computeConfluence({
      a1: mkA1({ confidence: 100, anomaly_detected: true, anomaly_type: 'oportunidad' }),
      a2: mkA2({ confidence: 100, opportunity_detected: true }),
      a3: mkA3({
        confidence: 100,
        operativa: { ...mkA3().operativa, signal: 'buy' },
      }),
      debate: mkDebate({ convergence_score: 100, direccion: 'alcista' }),
    });
    expect(r.score_total_pct).toBeLessThanOrEqual(100);
    expect(r.score_total_pct).toBeGreaterThanOrEqual(0);
  });
});

describe('computeConfluence — determinismo', () => {
  it('mismo input → mismo output, exactamente', () => {
    const input = {
      a1: mkA1({ confidence: 75, anomaly_detected: true, anomaly_type: 'oportunidad' as const }),
      a2: mkA2({ confidence: 65, opportunity_detected: true }),
      a3: mkA3({ confidence: 80, operativa: { ...mkA3().operativa, signal: 'buy' as const } }),
      debate: mkDebate({ convergence_score: 75 }),
    };
    expect(computeConfluence(input)).toEqual(computeConfluence(input));
  });

  it('5 ejecuciones idénticas con el mismo input', () => {
    const input = {
      a1: mkA1({ confidence: 60 }),
      a2: mkA2({ confidence: 50 }),
      a3: null,
      debate: null,
    };
    const runs = Array.from({ length: 5 }, () => computeConfluence(input));
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });
});

describe('levelFromScore', () => {
  it('thresholds correctos', () => {
    expect(levelFromScore(0)).toBe('baja');
    expect(levelFromScore(33)).toBe('baja');
    expect(levelFromScore(34)).toBe('media');
    expect(levelFromScore(66)).toBe('media');
    expect(levelFromScore(67)).toBe('alta');
    expect(levelFromScore(100)).toBe('alta');
  });
});

describe('Constantes exportadas — invariantes de diseño', () => {
  it('pesos suman 1.0', () => {
    expect(WEIGHT_A3_SOLO + WEIGHT_A1_A2 + WEIGHT_ALIGN).toBeCloseTo(1.0, 5);
  });

  it('ALIVE_CAPS es no decreciente en aliveCount', () => {
    for (let i = 1; i < ALIVE_CAPS.length; i++) {
      expect(ALIVE_CAPS[i]).toBeGreaterThanOrEqual(ALIVE_CAPS[i - 1]!);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REGRESIÓN — bug "Alineados pinta '—' incluso con agentes coincidiendo"
//
// Causa raíz: la UI antes usaba `lib/confluence.ts` cuya lógica de alignment
// era binaria y exigía `debate !== null`. Con A1/A2 sin señal el debate NO
// se dispara → alignment = 0 → UI lo muestra como "—".
//
// El motor canónico (este archivo) opera por direcciones de cada agente
// sin necesidad de debate. Estos tests son centinelas: si alguien añade
// "requires debate" a scoreAlignment, fallan y avisan.
// ───────────────────────────────────────────────────────────────────────────

describe('REGRESIÓN — Alineados funciona sin debate', () => {
  it('A1 oportunidad + A3 buy + A2 neutral, SIN debate → alineados > 0', () => {
    const result = computeConfluence({
      a1: mkA1({ confidence: 60, anomaly_detected: true, anomaly_type: 'oportunidad' }),
      a2: mkA2({ confidence: 40, opportunity_detected: false }),
      a3: mkA3({ confidence: 70, operativa: { ...mkA3().operativa, signal: 'buy' } }),
      debate: null,
    });
    // 2 agentes con dirección coincidente (alcista) → scoreAlignment = 70
    expect(result.alineados.score).toBe(70);
    expect(result.alineados.nivel).not.toBe('baja');
  });

  it('A1 vulnerabilidad + A3 sell, SIN debate → alineados bajista 70', () => {
    const result = computeConfluence({
      a1: mkA1({ confidence: 60, anomaly_detected: true, anomaly_type: 'vulnerabilidad' }),
      a2: null,
      a3: mkA3({ confidence: 70, operativa: { ...mkA3().operativa, signal: 'sell' } }),
      debate: null,
    });
    expect(result.alineados.score).toBe(70);
  });

  it('3 vivos coincidiendo alcista, SIN debate → alineados = 100', () => {
    const result = computeConfluence({
      a1: mkA1({ confidence: 60, anomaly_detected: true, anomaly_type: 'oportunidad' }),
      a2: mkA2({ confidence: 50, opportunity_detected: true }),
      a3: mkA3({ confidence: 70, operativa: { ...mkA3().operativa, signal: 'buy' } }),
      debate: null,
    });
    expect(result.alineados.score).toBe(100);
    expect(result.alineados.nivel).toBe('alta');
  });

  it('caso del screenshot: A3 50% + A1/A2 sin signal → alineados se calcula (no es 0 fijo)', () => {
    // Reproduce el escenario reportado por el usuario: A3 confidence 50,
    // A1+A2 sin signal pero ambos vivos con confidences medias. El motor
    // antiguo daba alineados = 0 SIEMPRE. El canónico debe devolver un
    // valor coherente con las direcciones de los agentes.
    const result = computeConfluence({
      a1: mkA1({ confidence: 40, anomaly_detected: false, anomaly_type: null }),
      a2: mkA2({ confidence: 38, opportunity_detected: false }),
      a3: mkA3({ confidence: 50, operativa: { ...mkA3().operativa, signal: 'hold' } }),
      debate: null,
    });
    // Todos neutrales → 0 (es coherente: nadie opina con dirección).
    // PERO si A3 cambia a buy, alineados sube. Eso es lo que importa.
    expect(result.alineados.score).toBe(0);

    // Y si A3 emite signal con A1/A2 neutrales, el solitario tira 30.
    const withA3Buy = computeConfluence({
      a1: mkA1({ confidence: 40, anomaly_detected: false, anomaly_type: null }),
      a2: mkA2({ confidence: 38, opportunity_detected: false }),
      a3: mkA3({ confidence: 50, operativa: { ...mkA3().operativa, signal: 'buy' } }),
      debate: null,
    });
    expect(withA3Buy.alineados.score).toBe(30);
  });
});
