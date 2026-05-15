/**
 * A.D.A.M. — Pipeline integrado `runADAM()`
 *
 * Refactor Fase 1 · Tarea 1.5
 *
 * Orquestador único que ejecuta TODO el análisis end-to-end:
 *
 *   1. Compute layer (sin LLM)
 *      - computeTechnical(ohlcv) → análisis técnico determinístico
 *
 *   2. LLM narrate paralelo (3 calls en flight a la vez)
 *      - narrateA1(snapshot) → análisis micro
 *      - narrateA2(snapshot) → contexto macro
 *      - narrateA3(computeOutput) → solo añade narrative al compute
 *
 *   3. Debate condicional (si A1 anomalía O A2 oportunidad, Y ambos vivos)
 *      - runDebate(a1, a2)
 *
 *   4. Compute confluence (sin LLM)
 *      - computeConfluence(...) → math determinística
 *
 *   5. A4 narrate
 *      - narrateA4(...confluence...) → output consolidado al usuario
 *
 * Todo bajo un `traceId` propagado para correlación de logs.
 *
 * Resilience:
 *   - A1/A2/A3 usan Promise.allSettled. Un agente caído NO mata el pipeline.
 *   - Si los 3 fallan → throw `AllAgentsFailedError`.
 *   - Si debate falla → log + continue (debate es opcional).
 *   - Si A4 falla → throw `A4FailedError` (es el output al usuario; sin él
 *     no hay análisis que devolver).
 */

import { randomUUID } from 'node:crypto';
import { narrateA1 } from '@/agents/a1/narrate';
import { narrateA2 } from '@/agents/a2/narrate';
import { narrateA3 } from '@/agents/a3/narrate';
import { narrateA4 } from '@/agents/a4/narrate';
import { runDebate } from '@/agents/debate/client';
import { computeConfluence, type DebateForConfluence } from '@/agents/a4/compute';
import type {
  A1Output_t,
  A2Output_t,
  A3Output_t,
  A4Output_t,
  MarketSnapshot,
} from '@/agents/shared/types';
import type { AgentUsage } from '@/lib/anthropic';

// ───────────────────────────────────────────────────────────────────────────
// Tipos públicos del pipeline
// ───────────────────────────────────────────────────────────────────────────

export interface RunADAMOptions {
  /** Trace ID externo (ej. desde el endpoint). Si no se pasa, se genera. */
  traceId?: string;
  /** Callback para coste/tokens — recibe usage de cada llamada LLM. */
  onUsage?: (u: AgentUsage) => void;
  /** Para tests: inyectar implementaciones mock de cada agente. */
  agents?: AgentImplementations;
}

/**
 * Inyectables de agentes — permite mockear en tests sin tocar imports
 * mágicos. Por defecto usa las implementaciones reales.
 */
export interface AgentImplementations {
  narrateA1?: typeof narrateA1;
  narrateA2?: typeof narrateA2;
  narrateA3?: typeof narrateA3;
  narrateA4?: typeof narrateA4;
  runDebate?: typeof runDebate;
}

export interface RunADAMResult {
  /** Output final consolidado al usuario. */
  output: A4Output_t;
  /** Para diagnostics: qué agentes vivieron, cuál fue el trace, etc. */
  meta: {
    traceId: string;
    failures: { agent: string; message: string }[];
    debateRan: boolean;
    durationMs: number;
  };
}

export class AllAgentsFailedError extends Error {
  constructor(
    public readonly failures: { agent: string; message: string }[]
  ) {
    super(
      `Los 3 agentes A1/A2/A3 cayeron. Imposible producir output. (${failures
        .map((f) => f.agent)
        .join(', ')})`
    );
    this.name = 'AllAgentsFailedError';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers exportados (testeables)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Decide si disparar el módulo Debate A1×A2.
 *
 * Condiciones (todas necesarias):
 *   - Ambos a1 y a2 deben estar vivos (sin Debate sin contraparte)
 *   - Al menos uno detectó algo: A1.anomaly_detected OR A2.opportunity_detected
 *
 * Si la condición no se cumple, devolvemos null en el pipeline y la
 * confluence usa el path "sin debate" (peso reducido para A1+A2).
 */
export function needsDebate(
  a1: A1Output_t | null,
  a2: A2Output_t | null
): boolean {
  if (!a1 || !a2) return false;
  return a1.anomaly_detected || a2.opportunity_detected;
}

// ───────────────────────────────────────────────────────────────────────────
// Orquestador
// ───────────────────────────────────────────────────────────────────────────

export async function runADAM(
  ticker: string,
  snapshot: MarketSnapshot,
  options: RunADAMOptions = {}
): Promise<RunADAMResult> {
  const traceId = options.traceId ?? randomUUID();
  const startedAt = Date.now();
  const onUsage = options.onUsage;

  // Inyectables: por defecto las funciones reales
  const A = {
    narrateA1: options.agents?.narrateA1 ?? narrateA1,
    narrateA2: options.agents?.narrateA2 ?? narrateA2,
    narrateA3: options.agents?.narrateA3 ?? narrateA3,
    narrateA4: options.agents?.narrateA4 ?? narrateA4,
    runDebate: options.agents?.runDebate ?? runDebate,
  };

  // eslint-disable-next-line no-console
  console.log(`[pipeline] ${traceId} start ticker=${ticker}`);

  // ── Step 1+2: LLM paralelo de A1, A2, A3 (A3 incluye su propio compute)
  const settled = await Promise.allSettled([
    A.narrateA1(ticker, snapshot, { traceId, onUsage }),
    A.narrateA2(ticker, snapshot, { traceId, onUsage }),
    A.narrateA3(
      {
        ticker,
        ohlcv: snapshot.ohlcv_daily,
        timeframe: '1D',
      },
      { traceId, onUsage }
    ),
  ]);

  const a1: A1Output_t | null = settled[0]!.status === 'fulfilled' ? settled[0]!.value : null;
  const a2: A2Output_t | null = settled[1]!.status === 'fulfilled' ? settled[1]!.value : null;
  const a3: A3Output_t | null = settled[2]!.status === 'fulfilled' ? settled[2]!.value : null;

  const failures: { agent: string; message: string }[] = [];
  if (settled[0]!.status === 'rejected') {
    failures.push({
      agent: 'A1',
      message: extractErrorMsg(settled[0]!.reason),
    });
  }
  if (settled[1]!.status === 'rejected') {
    failures.push({
      agent: 'A2',
      message: extractErrorMsg(settled[1]!.reason),
    });
  }
  if (settled[2]!.status === 'rejected') {
    failures.push({
      agent: 'A3',
      message: extractErrorMsg(settled[2]!.reason),
    });
  }

  if (!a1 && !a2 && !a3) {
    throw new AllAgentsFailedError(failures);
  }

  // ── Step 3: Debate condicional
  let debate: DebateForConfluence | null = null;
  let debateRan = false;
  if (needsDebate(a1, a2)) {
    try {
      const debateFull = await A.runDebate({ a1: a1!, a2: a2! }, onUsage);
      debate = {
        convergence_score: debateFull.convergence_score,
        direccion: debateFull.direccion,
      };
      debateRan = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] ${traceId} debate failed, continuing without:`,
        extractErrorMsg(err)
      );
    }
  }

  // ── Step 4: Confluence determinístico (no LLM, no falla)
  const confluence = computeConfluence({ a1, a2, a3, debate });

  // ── Step 5: A4 narrate
  const output = await A.narrateA4(
    {
      ticker,
      a1,
      a2,
      a3,
      debate,
      confluence,
      failures,
    },
    { traceId, onUsage }
  );

  const durationMs = Date.now() - startedAt;
  // eslint-disable-next-line no-console
  console.log(
    `[pipeline] ${traceId} done in ${durationMs}ms · alive=${[a1, a2, a3].filter(Boolean).length}/3 · debate=${debateRan}`
  );

  return {
    output,
    meta: {
      traceId,
      failures,
      debateRan,
      durationMs,
    },
  };
}

function extractErrorMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown';
}
