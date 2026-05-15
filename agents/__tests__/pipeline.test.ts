/**
 * Tests para agents/pipeline.ts
 *
 * Cubre los acceptance criteria del plan §5 Tarea 1.5:
 *   - Pipeline corre end-to-end con mocks de los 4 agentes
 *   - Trace ID propagado a todos los logs (verificable porque cada narrate
 *     mock captura el traceId que recibe)
 *   - Output valida contra A4Output strict
 *   - Manejo de fallos:
 *       · 1 agente caído → resto sigue, A4 produce output con failures
 *       · 3 agentes caídos → AllAgentsFailedError
 *   - Debate condicional: dispara solo si needsDebate() = true
 *
 * Estrategia: inyectamos mocks vía `options.agents`. NO tocamos red ni LLM.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runADAM,
  needsDebate,
  AllAgentsFailedError,
} from '../pipeline';
import {
  A4Output,
  DISCLAIMER_LITERAL,
  type A1Output_t,
  type A2Output_t,
  type A3Output_t,
  type A4Output_t,
  type MarketSnapshot,
} from '@/agents/shared/types';

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

function mkSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    ticker: 'AAPL',
    quote: { current: 100, change_pct_24h: 0, change_pct_7d: 0, currency: 'USD' },
    fundamentals: {
      per: null,
      peg: null,
      ev_ebitda: null,
      fcf_yield_pct: null,
      dividend_yield_pct: null,
      market_cap_usd: null,
    },
    news: [],
    ohlcv_daily: Array.from({ length: 30 }, (_, i) => ({
      t: i * 86400,
      o: 100,
      h: 101,
      l: 99,
      c: 100,
      v: 1000,
    })),
    ohlcv_intraday: [],
    macro_snapshot: {},
    ...overrides,
  };
}

function mkA1(o: Partial<A1Output_t> = {}): A1Output_t {
  return {
    ticker: 'AAPL',
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
    anomaly_description: 'sin anomalía detectada en el snapshot actual',
    confidence: 50,
    narrative: 'narrativa A1 de prueba, suficientemente larga para validar.',
    ...o,
  };
}

function mkA2(o: Partial<A2Output_t> = {}): A2Output_t {
  return {
    ticker: 'AAPL',
    macro_context: {
      ciclo_economico: 'expansion',
      regimen_tipos: 'pausa',
      inflacion_trend: 'estable',
      fed_funds_rate_pct: null,
      us_10y_yield_pct: null,
      narrative: 'régimen macro estable suficientemente largo para validar.',
    },
    factores_clave: [],
    correlaciones: [],
    prevision: { horizonte: '1Y', rango_esperado: 'rango', factor_invalidante: 'factor' },
    opportunity_detected: false,
    opportunity_description: null,
    confidence: 50,
    narrative: 'narrativa A2 suficientemente larga para validar.',
    ...o,
  };
}

function mkA3(o: Partial<A3Output_t> = {}): A3Output_t {
  return {
    ticker: 'AAPL',
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
    factor_invalidacion: 'factor invalidación de prueba.',
    confidence: 50,
    narrative: 'narrativa A3 suficientemente larga para validar.',
    ...o,
  };
}

function mkA4(o: Partial<A4Output_t> = {}): A4Output_t {
  return {
    ticker: 'AAPL',
    confluence: {
      a3_solo: { score: 50, nivel: 'baja' },
      a1_a2: { score: 35, nivel: 'media' },
      alineados: { score: 0, nivel: 'baja' },
      score_total_pct: 29,
      nivel_final: 'baja',
    },
    resumen_a1: 'A1 sin anomalías. Activo en línea con expectativas.',
    resumen_a2: 'Macro estable. Régimen de tipos en pausa.',
    resumen_a3: 'A3 hold. Tendencia lateral sin trigger.',
    direccion: 'neutral',
    confianza: 'baja',
    accion_sugerida:
      'Esperar a que se defina estructura. No hay confluencia para tomar posición operativa hoy.',
    riesgo_clave: 'Pérdida de soportes con volumen alto invalidaría sesgo neutro.',
    disclaimer: DISCLAIMER_LITERAL,
    ...o,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// needsDebate
// ───────────────────────────────────────────────────────────────────────────

describe('needsDebate', () => {
  it('false si a1 o a2 null', () => {
    expect(needsDebate(null, mkA2())).toBe(false);
    expect(needsDebate(mkA1(), null)).toBe(false);
    expect(needsDebate(null, null)).toBe(false);
  });

  it('false si ambos vivos pero ninguno detecta', () => {
    expect(needsDebate(mkA1({ anomaly_detected: false }), mkA2({ opportunity_detected: false }))).toBe(false);
  });

  it('true si a1 detecta anomalía', () => {
    expect(needsDebate(mkA1({ anomaly_detected: true }), mkA2())).toBe(true);
  });

  it('true si a2 detecta oportunidad', () => {
    expect(needsDebate(mkA1(), mkA2({ opportunity_detected: true }))).toBe(true);
  });

  it('true si ambos detectan', () => {
    expect(
      needsDebate(
        mkA1({ anomaly_detected: true }),
        mkA2({ opportunity_detected: true })
      )
    ).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runADAM — happy path con mocks
// ───────────────────────────────────────────────────────────────────────────

describe('runADAM — happy path', () => {
  it('los 3 agentes responden + no dispara debate + A4 produce output', async () => {
    const narrateA1 = vi.fn(async () => mkA1());
    const narrateA2 = vi.fn(async () => mkA2());
    const narrateA3 = vi.fn(async () => mkA3());
    const narrateA4 = vi.fn(async () => mkA4());
    const runDebate = vi.fn();

    const result = await runADAM('AAPL', mkSnapshot(), {
      agents: { narrateA1, narrateA2, narrateA3, narrateA4, runDebate },
    });

    expect(narrateA1).toHaveBeenCalledOnce();
    expect(narrateA2).toHaveBeenCalledOnce();
    expect(narrateA3).toHaveBeenCalledOnce();
    expect(runDebate).not.toHaveBeenCalled();
    expect(narrateA4).toHaveBeenCalledOnce();

    expect(result.output).toBeDefined();
    expect(() => A4Output.parse(result.output)).not.toThrow();
    expect(result.meta.failures).toHaveLength(0);
    expect(result.meta.debateRan).toBe(false);
    expect(result.meta.traceId).toBeDefined();
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('dispara debate si A1 anomalía detectada', async () => {
    const narrateA1 = vi.fn(async () => mkA1({ anomaly_detected: true, anomaly_type: 'oportunidad' }));
    const narrateA2 = vi.fn(async () => mkA2());
    const narrateA3 = vi.fn(async () => mkA3());
    const narrateA4 = vi.fn(async () => mkA4());
    const runDebate = vi.fn(async () => ({
      ticker: 'AAPL',
      convergence_score: 75,
      argumento_a1: 'argumento a1 sufficientemente largo para validar el schema',
      argumento_a2: 'argumento a2 sufficientemente largo para validar el schema',
      puntos_convergencia: [],
      puntos_divergencia: [],
      punto_critico_de_debate: 'punto crítico',
      oportunidad_validada: true,
      direccion: 'alcista' as const,
      horizonte_relevante: '3-6 meses',
      recomendacion_consolidada:
        'recomendación consolidada con suficiente longitud para pasar la validación de schema',
      factor_invalidante: 'factor invalidante',
    }));

    const result = await runADAM('AAPL', mkSnapshot(), {
      agents: { narrateA1, narrateA2, narrateA3, narrateA4, runDebate },
    });

    expect(runDebate).toHaveBeenCalledOnce();
    expect(result.meta.debateRan).toBe(true);
  });

  it('propaga traceId externo a todos los agentes', async () => {
    const recordedTraceIds: string[] = [];
    const captureA1 = vi.fn(async (_t: string, _s: MarketSnapshot, opts?: { traceId?: string }) => {
      if (opts?.traceId) recordedTraceIds.push(opts.traceId);
      return mkA1();
    });
    const captureA2 = vi.fn(async (_t: string, _s: MarketSnapshot, opts?: { traceId?: string }) => {
      if (opts?.traceId) recordedTraceIds.push(opts.traceId);
      return mkA2();
    });
    const captureA3 = vi.fn(async (_input: unknown, opts?: { traceId?: string }) => {
      if (opts?.traceId) recordedTraceIds.push(opts.traceId);
      return mkA3();
    });
    const captureA4 = vi.fn(async (_input: unknown, opts?: { traceId?: string }) => {
      if (opts?.traceId) recordedTraceIds.push(opts.traceId);
      return mkA4();
    });

    const customTrace = 'test-trace-xyz';
    const result = await runADAM('AAPL', mkSnapshot(), {
      traceId: customTrace,
      agents: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        narrateA1: captureA1 as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        narrateA2: captureA2 as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        narrateA3: captureA3 as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        narrateA4: captureA4 as any,
      },
    });

    expect(result.meta.traceId).toBe(customTrace);
    // 4 agentes recibieron el traceId (A1, A2, A3 narrate, A4)
    expect(recordedTraceIds.filter((t) => t === customTrace).length).toBe(4);
  });

  it('genera un traceId nuevo si no se pasa uno', async () => {
    const narrateA1 = vi.fn(async () => mkA1());
    const narrateA2 = vi.fn(async () => mkA2());
    const narrateA3 = vi.fn(async () => mkA3());
    const narrateA4 = vi.fn(async () => mkA4());

    const r = await runADAM('AAPL', mkSnapshot(), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agents: { narrateA1, narrateA2, narrateA3, narrateA4 } as any,
    });
    expect(r.meta.traceId.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runADAM — resilience: fallos parciales y totales
// ───────────────────────────────────────────────────────────────────────────

describe('runADAM — fallos parciales', () => {
  it('A1 cae → A2 y A3 viven, A4 produce output con failure registrada', async () => {
    const narrateA1 = vi.fn(async () => {
      throw new Error('Anthropic 429');
    });
    const narrateA2 = vi.fn(async () => mkA2());
    const narrateA3 = vi.fn(async () => mkA3());
    const narrateA4 = vi.fn(async () => mkA4());

    const r = await runADAM('AAPL', mkSnapshot(), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agents: { narrateA1, narrateA2, narrateA3, narrateA4 } as any,
    });

    expect(r.meta.failures).toEqual([{ agent: 'A1', message: 'Anthropic 429' }]);
    expect(narrateA4).toHaveBeenCalledOnce();
    expect(() => A4Output.parse(r.output)).not.toThrow();
  });

  it('2 de 3 caen → A4 sigue corriendo con 1 agente vivo', async () => {
    const narrateA1 = vi.fn(async () => {
      throw new Error('A1 timeout');
    });
    const narrateA2 = vi.fn(async () => {
      throw new Error('A2 timeout');
    });
    const narrateA3 = vi.fn(async () => mkA3());
    const narrateA4 = vi.fn(async () => mkA4());

    const r = await runADAM('AAPL', mkSnapshot(), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agents: { narrateA1, narrateA2, narrateA3, narrateA4 } as any,
    });

    expect(r.meta.failures).toHaveLength(2);
    expect(narrateA4).toHaveBeenCalledOnce();
  });

  it('los 3 caen → AllAgentsFailedError', async () => {
    const narrateA1 = vi.fn(async () => {
      throw new Error('A1 down');
    });
    const narrateA2 = vi.fn(async () => {
      throw new Error('A2 down');
    });
    const narrateA3 = vi.fn(async () => {
      throw new Error('A3 down');
    });
    const narrateA4 = vi.fn(); // no debería llamarse

    await expect(
      runADAM('AAPL', mkSnapshot(), {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        agents: { narrateA1, narrateA2, narrateA3, narrateA4 } as any,
      })
    ).rejects.toThrow(AllAgentsFailedError);

    expect(narrateA4).not.toHaveBeenCalled();
  });

  it('debate falla → pipeline continúa sin debate', async () => {
    const narrateA1 = vi.fn(async () => mkA1({ anomaly_detected: true, anomaly_type: 'oportunidad' }));
    const narrateA2 = vi.fn(async () => mkA2());
    const narrateA3 = vi.fn(async () => mkA3());
    const narrateA4 = vi.fn(async () => mkA4());
    const runDebate = vi.fn(async () => {
      throw new Error('debate timeout');
    });

    const r = await runADAM('AAPL', mkSnapshot(), {
      agents: { narrateA1, narrateA2, narrateA3, narrateA4, runDebate },
    });

    expect(r.meta.debateRan).toBe(false);
    expect(narrateA4).toHaveBeenCalledOnce();
  });
});
