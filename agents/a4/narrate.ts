/**
 * A.D.A.M. — narrateA4
 *
 * Refactor Fase 1 · Tarea 1.5
 *
 * Recibe A1+A2+A3+Debate (opcional) + confluence YA calculada y produce
 * el A4Output final. El LLM solo genera los campos prosaicos (resumenes,
 * direccion, confianza, accion_sugerida, riesgo_clave). En código se
 * mergea:
 *   - `ticker` (lo pasamos)
 *   - `confluence` (computeConfluence)
 *   - `disclaimer` (literal)
 *
 * Esto garantiza que la confluencia que cuenta es la determinística, NO
 * lo que el LLM "interprete".
 */

import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayContext, todayISO } from '@/lib/utils';
import { A4_SYSTEM_PROMPT } from './prompt';
import {
  A4NarrativeOnly,
  type A1Output_t,
  type A2Output_t,
  type A3Output_t,
  type A4Output_t,
  type ConfluenceResult,
  DISCLAIMER_LITERAL,
} from '@/agents/shared/types';
import type { z } from 'zod';
import type { DebateForConfluence } from './compute';

export interface NarrateA4Input {
  ticker: string;
  a1: A1Output_t | null;
  a2: A2Output_t | null;
  a3: A3Output_t | null;
  debate: DebateForConfluence | null;
  confluence: z.infer<typeof ConfluenceResult>;
  /** Mensajes de los agentes que cayeron — para que A4 contextualice. */
  failures?: { agent: string; message: string }[];
}

export interface NarrateA4Options {
  traceId?: string;
  onUsage?: (u: AgentUsage) => void;
}

/**
 * Trim helpers — el prompt A4 actual ya pide solo extractos relevantes,
 * pero aquí los simplificamos aún más porque la confluence ya está
 * resuelta. El LLM solo necesita conocer narrative + dirección de cada uno.
 */
function trimA1(a1: A1Output_t) {
  return {
    ticker: a1.ticker,
    anomaly_detected: a1.anomaly_detected,
    anomaly_type: a1.anomaly_type,
    confidence: a1.confidence,
    narrative: a1.narrative,
  };
}

function trimA2(a2: A2Output_t) {
  return {
    ticker: a2.ticker,
    opportunity_detected: a2.opportunity_detected,
    confidence: a2.confidence,
    narrative: a2.narrative,
  };
}

function trimDebate(d: DebateForConfluence) {
  return {
    convergence_score: d.convergence_score,
    direccion: d.direccion,
  };
}

export async function narrateA4(
  input: NarrateA4Input,
  options: NarrateA4Options = {}
): Promise<A4Output_t> {
  const { traceId, onUsage } = options;

  const a1Note = input.failures?.find((f) => f.agent === 'A1')?.message;
  const a2Note = input.failures?.find((f) => f.agent === 'A2')?.message;
  const a3Note = input.failures?.find((f) => f.agent === 'A3')?.message;

  const part = (label: string, value: unknown, note?: string): string => {
    if (value === null || value === undefined) {
      return `## ${label}:\n(no disponible${note ? ` — ${note}` : ''})`;
    }
    return `## ${label}:\n${JSON.stringify(value, null, 2)}`;
  };

  const userMessage = [
    `# FECHA ACTUAL: ${todayContext()} · ${todayISO()}`,
    `# TRACE: ${traceId ?? 'no-trace'}`,
    'La recomendación se emite con datos de HOY. Los niveles citados de A3',
    'son ejecutables a partir de ahora. NO recicles patrones de tu training.',
    '',
    `Ticker: ${input.ticker}`,
    '',
    '# CONFLUENCIA YA CALCULADA POR EL SISTEMA',
    '',
    'La siguiente confluencia es DETERMINÍSTICA — no la recalcules ni la',
    'cuestiones. Úsala para construir la dirección y el nivel de confianza.',
    '',
    JSON.stringify(input.confluence, null, 2),
    '',
    part('A1 (Activo) — extracto', input.a1 ? trimA1(input.a1) : null, a1Note),
    '',
    part('A2 (Macro) — extracto', input.a2 ? trimA2(input.a2) : null, a2Note),
    '',
    '## A3 (Técnico — cita textual, NO modificar):',
    input.a3 ? JSON.stringify(input.a3, null, 2) : `(no disponible${a3Note ? ` — ${a3Note}` : ''})`,
    '',
    '## Debate (si existe) — extracto:',
    input.debate ? JSON.stringify(trimDebate(input.debate), null, 2) : 'No se disparó debate.',
    '',
    'PRODUCE SOLO los campos prosaicos (resumenes, direccion, confianza,',
    'accion_sugerida, riesgo_clave). El sistema añadirá ticker, confluence',
    'y disclaimer.',
  ].join('\n');

  // El A4 SYSTEM_PROMPT actual instruye al LLM a producir el A4Output
  // completo (incluyendo confluence + disclaimer). Aquí validamos con
  // A4NarrativeOnly que IGNORA esos campos — si el LLM los manda igualmente,
  // .strict() los rechazará. El prompt en el userMessage le dice
  // explícitamente que NO los emita.
  const narrated = await runAgent({
    agentName: 'A4',
    systemPrompt: A4_SYSTEM_PROMPT,
    userMessage,
    schema: A4NarrativeOnly,
    model: MODELS.HAIKU,
    maxTokens: 3000,
    temperature: 0.3,
    onUsage,
  });

  // Merge final: lo prosaico + ticker + confluence + disclaimer literal
  return {
    ticker: input.ticker,
    confluence: input.confluence,
    ...narrated,
    disclaimer: DISCLAIMER_LITERAL,
  };
}
