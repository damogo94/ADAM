import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { A4_SYSTEM_PROMPT } from './prompt';
import { A4_OUTPUT_SCHEMA, type A4Output } from './schema';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';
import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';

/**
 * A4 puede recibir agents que NO ejecutaron (fallo transitorio, rate-limit, etc).
 * Cualquier subset >=1 es válido; el prompt instruye a A4 a degradar la confluencia
 * y a reflejarlo en `resumen_*`.
 */
export interface A4Input {
  ticker: string;
  a1: A1Output | null;
  a2: A2Output | null;
  a3: A3Output | null;
  debate: DebateOutput | null;
  /** Mensajes de los agentes que fallaron — para que A4 contextualice. */
  failures?: { agent: string; message: string }[];
}

/**
 * A4 ensambla pero NO envía nada de vuelta a A3. A3 sigue aislado para futuros
 * análisis. Esta función sólo produce el output al usuario.
 */
export async function runA4(input: A4Input, onUsage?: (u: AgentUsage) => void): Promise<A4Output> {
  const part = (label: string, value: unknown, note?: string) => {
    if (value === null || value === undefined) {
      return [`## ${label}:`, `(agente no disponible en este análisis${note ? ` — ${note}` : ''})`].join('\n');
    }
    return [`## ${label}:`, JSON.stringify(value, null, 2)].join('\n');
  };

  const a1Note = input.failures?.find((f) => f.agent === 'A1')?.message;
  const a2Note = input.failures?.find((f) => f.agent === 'A2')?.message;
  const a3Note = input.failures?.find((f) => f.agent === 'A3')?.message;

  const userMessage = [
    `Ticker: ${input.ticker}`,
    '',
    part('A1 (Activo)', input.a1, a1Note),
    '',
    part('A2 (Macro)', input.a2, a2Note),
    '',
    '## A3 (Técnico — cita textual, NO modificar):',
    input.a3 ? JSON.stringify(input.a3, null, 2) : `(agente no disponible${a3Note ? ` — ${a3Note}` : ''})`,
    '',
    '## Debate (si existe):',
    input.debate ? JSON.stringify(input.debate, null, 2) : 'No se disparó debate.',
    '',
    input.failures && input.failures.length > 0
      ? `⚠️ NOTA: ${input.failures.length} agente(s) fallaron transitoriamente — refleja esto bajando la confluencia y describiendo qué dimensión falta en los resumen_*.`
      : '',
    'Calcula la confluencia y emite la recomendación consolidada según el formato.',
  ].join('\n');

  return runAgent({
    agentName: 'A4',
    systemPrompt: A4_SYSTEM_PROMPT,
    userMessage,
    schema: A4_OUTPUT_SCHEMA,
    // Antes OPUS. Cambiado a SONNET para caber en maxDuration=60s del
    // plan Hobby. Opus al final del pipeline (después de A1+A2+A3+Debate)
    // consumía los últimos 20-25s y mataba lambdas. Sonnet hace el
    // ensamblado + confluencia en ~10s con calidad suficiente.
    // Upgrade a OPUS cuando Vercel Pro permita maxDuration 300s.
    model: MODELS.SONNET,
    maxTokens: 2048,
    temperature: 0.3,
    onUsage,
  });
}
