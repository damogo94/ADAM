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
import type { DebateOutput } from '@/agents/debate/schema';
import type {
  A1Output_t,
  A2Output_t,
  A3Output_t,
  A4Output_t,
  MarketSnapshot,
} from '@/agents/shared/types';
import type { AgentUsage } from '@/lib/anthropic';
import { readA2Cache } from '@/lib/a2-cache';

// ───────────────────────────────────────────────────────────────────────────
// Tipos públicos del pipeline
// ───────────────────────────────────────────────────────────────────────────

/**
 * Evento de progreso del pipeline. runADAM los emite vía `onEvent` a medida que
 * cada agente ATERRIZA de verdad — sin hitos fabricados (línea roja de honestidad
 * del proyecto). El endpoint /run los serializa como NDJSON para que la UI flipee
 * cada card en su evento real (sustituye al carrusel teatral).
 */
export type PipelineEvent =
  | {
      type: 'agent';
      agent: 'a1' | 'a2' | 'a3';
      status: 'done' | 'anomaly' | 'error';
      data: A1Output_t | A2Output_t | A3Output_t | null;
    }
  | { type: 'debate'; status: 'done' | 'skipped'; data: DebateOutput | null };

export interface RunADAMOptions {
  /** Trace ID externo (ej. desde el endpoint). Si no se pasa, se genera. */
  traceId?: string;
  /** Callback para coste/tokens — recibe usage de cada llamada LLM. */
  onUsage?: (u: AgentUsage) => void;
  /**
   * Progreso en streaming: se invoca cuando cada agente aterriza (evento real,
   * nunca fabricado). Default no-op → callers que no streamean (cron, tests
   * legacy) no pagan nada.
   */
  onEvent?: (e: PipelineEvent) => void;
  /** Para tests: inyectar implementaciones mock de cada agente. */
  agents?: AgentImplementations;
  /**
   * Si true, A2 SOLO se lee desde a2_cache (no se llama narrateA2). En cache
   * miss, A2 queda null y la pipeline degrada (sin Debate). Lo usa
   * /api/agents/run para evitar saturar el lambda de 60s; el endpoint
   * paralelo /api/agents/a2 calienta el cache en su propio lambda.
   * Default false → tests y callers legacy ejecutan narrateA2 como fallback.
   */
  skipA2Narrate?: boolean;
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
  /**
   * Outputs intermedios crudos para persistencia/auditoría.
   * Cualquiera puede ser null si ese agente falló (pipeline es resiliente).
   * `debate` es null cuando no se disparó O cuando falló transitoriamente.
   */
  intermediates: {
    a1: A1Output_t | null;
    a2: A2Output_t | null;
    a3: A3Output_t | null;
    /** Debate completo (no la versión trimmed que usa computeConfluence). */
    debate: DebateOutput | null;
  };
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
  const emit = options.onEvent ?? (() => {});

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

  // ── A2: cache lookup primero (instant, sin LLM) ──
  // Si el macro snapshot trae un as_of válido y hay entrada en a2_cache,
  // usamos A2 sin gastar tokens. En cache miss decidimos abajo si narrar.
  let a2: A2Output_t | null = await readA2FromMacroSnapshot(ticker, snapshot);
  if (a2) {
    // eslint-disable-next-line no-console
    console.log(`[pipeline] ${traceId} A2 from cache (no Anthropic call)`);
    emit({ type: 'agent', agent: 'a2', status: a2.opportunity_detected ? 'anomaly' : 'done', data: a2 });
  }

  // ¿Narramos A2 con LLM? Solo si hubo cache miss y el caller no pidió skip.
  //   - /api/agents/run pasa skipA2Narrate=true → A2 jamás narra aquí; su
  //     lambda paralelo /api/agents/a2 calienta el cache por separado.
  //   - cron (runForUser) y callers legacy → narran A2 como fallback.
  const runA2Narrate = !a2 && !options.skipA2Narrate;

  // ── Step 1+2: LLM en paralelo (A1 + A3 [+ A2 si toca narrar]) ──
  //
  // Arquitectura "A2 desacoplado" (2026-05-21): /api/agents/run pasa
  // skipA2Narrate=true para que el bloque paralelo sea solo A1+A3 (~12s) y
  // A2 se lea del cache o lo caliente su propio lambda — evita el 504 que
  // daba al sumar A2(Sonnet 25s) + Debate + A4 dentro del lambda de 60s.
  //
  // Para el cron (runForUser) y callers legacy NO hay lambda externo que
  // caliente el cache, así que A2 SÍ se narra. La clave: la arrancamos ANTES
  // del allSettled de A1/A3 para que las tres llamadas solapen (~max 25s) en
  // vez de correr A2 en serie después (lo que sumaba ~12s+25s y rebasaba el
  // budget). Paralelizada: ~max(25s) + Debate(~15s) + A4(~6s) ≈ 46s, con
  // cushion para los 60s de Hobby. Adjuntamos .then/.catch al crear el
  // promise para no arriesgar un unhandledRejection mientras esperamos A1/A3.
  const a2NarratePromise:
    | Promise<{ ok: true; value: A2Output_t } | { ok: false; error: unknown }>
    | null = runA2Narrate
    ? timed('A2', traceId, () => A.narrateA2(ticker, snapshot, { traceId, onUsage }))
        .then((value) => ({ ok: true as const, value }))
        .catch((error) => ({ ok: false as const, error }))
    : null;

  const settled = await Promise.allSettled([
    timed('A1', traceId, () => A.narrateA1(ticker, snapshot, { traceId, onUsage })),
    timed('A3', traceId, () =>
      A.narrateA3(
        {
          ticker,
          ohlcv: snapshot.ohlcv_daily,
          timeframe: '1D',
          intraday: snapshot.ohlcv_intraday,
        },
        { traceId, onUsage }
      )
    ),
  ]);

  const a1: A1Output_t | null = settled[0]!.status === 'fulfilled' ? settled[0]!.value : null;
  const a3: A3Output_t | null = settled[1]!.status === 'fulfilled' ? settled[1]!.value : null;

  // Eventos reales: A1/A3 acaban de aterrizar (juntos tras el allSettled).
  emit({
    type: 'agent',
    agent: 'a1',
    status: a1 ? (a1.anomaly_detected ? 'anomaly' : 'done') : 'error',
    data: a1,
  });
  emit({ type: 'agent', agent: 'a3', status: a3 ? 'done' : 'error', data: a3 });

  const failures: { agent: string; message: string }[] = [];
  if (settled[0]!.status === 'rejected') {
    failures.push({
      agent: 'A1',
      message: extractErrorMsg(settled[0]!.reason),
    });
  }
  if (settled[1]!.status === 'rejected') {
    failures.push({
      agent: 'A3',
      message: extractErrorMsg(settled[1]!.reason),
    });
  }

  // Recogemos A2 narrado (ya en vuelo, en paralelo con A1/A3).
  if (a2NarratePromise) {
    const r = await a2NarratePromise;
    if (r.ok) {
      a2 = r.value;
      emit({ type: 'agent', agent: 'a2', status: a2.opportunity_detected ? 'anomaly' : 'done', data: a2 });
    } else {
      failures.push({ agent: 'A2', message: extractErrorMsg(r.error) });
    }
  }
  // Si skipA2Narrate=true Y cache miss → a2 queda null. El standalone
  // endpoint del frontend llenará el hueco en el UI.

  if (!a1 && !a3 && !a2) {
    throw new AllAgentsFailedError(failures);
  }

  // ── Step 3: Debate condicional
  // El bloque paralelo es A1+A3 (~12s) en /run, o A1+A2+A3 (~25s) en el cron,
  // dejando budget para Debate (~15s) + A4 (~6s). Worst case ~46s, con
  // cushion para los 60s de Hobby. Budget-aware skip removido por innecesario.
  let debate: DebateOutput | null = null;
  let debateRan = false;
  if (needsDebate(a1, a2)) {
    try {
      debate = await A.runDebate({ a1: a1!, a2: a2! }, onUsage);
      debateRan = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline] ${traceId} debate failed, continuing without:`,
        extractErrorMsg(err)
      );
    }
  }
  emit({ type: 'debate', status: debate ? 'done' : 'skipped', data: debate });

  // ── Step 4: Confluence determinístico (no LLM, no falla)
  const debateForCompute: DebateForConfluence | null = debate
    ? { convergence_score: debate.convergence_score, direccion: debate.direccion }
    : null;
  const confluence = computeConfluence({ a1, a2, a3, debate: debateForCompute });

  // ── Step 5: A4 narrate
  const output = await A.narrateA4(
    {
      ticker,
      a1,
      a2,
      a3,
      debate: debateForCompute,
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
    intermediates: { a1, a2, a3, debate },
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

/**
 * Lee A2 desde cache usando el `as_of` del macro snapshot como clave.
 * Devuelve null si no hay snapshot valido o cache miss — la pipeline
 * degrada graciosamente sin A2 (sin Debate).
 */
async function readA2FromMacroSnapshot(
  ticker: string,
  snapshot: MarketSnapshot
): Promise<A2Output_t | null> {
  if (!snapshot.macro_snapshot || typeof snapshot.macro_snapshot !== 'object') return null;
  const asOf = (snapshot.macro_snapshot as { as_of?: unknown }).as_of;
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  return readA2Cache(ticker, asOf);
}

/**
 * Envuelve una llamada de agente para loguear duracion + outcome.
 * El log emitido va a Vercel runtime logs y aparece como una linea por
 * agente con formato:
 *   [pipeline] <trace> A2 ok in 12345ms
 *   [pipeline] <trace> A2 FAIL in 25001ms · Request timed out.
 * Esto da la pista necesaria para diagnosticar timeouts en prod.
 */
async function timed<T>(
  agent: string,
  traceId: string,
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    // eslint-disable-next-line no-console
    console.log(`[pipeline] ${traceId} ${agent} ok in ${Date.now() - t0}ms`);
    return out;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pipeline] ${traceId} ${agent} FAIL in ${Date.now() - t0}ms · ${extractErrorMsg(err)}`
    );
    throw err;
  }
}
