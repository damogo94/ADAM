import { runAgent, MODELS } from '@/lib/anthropic';
import { A4_SYSTEM_PROMPT } from './prompt';
import { A4_OUTPUT_SCHEMA, type A4Output } from './schema';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';
import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';

export interface A4Input {
  a1: A1Output;
  a2: A2Output;
  a3: A3Output;
  debate: DebateOutput | null;
}

/**
 * A4 ensambla pero NO envía nada de vuelta a A3. A3 sigue aislado para futuros
 * análisis. Esta función sólo produce el output al usuario.
 */
export async function runA4(input: A4Input): Promise<A4Output> {
  const userMessage = [
    `Ticker: ${input.a1.ticker}`,
    '',
    '## A1 (Activo):',
    JSON.stringify(input.a1, null, 2),
    '',
    '## A2 (Macro):',
    JSON.stringify(input.a2, null, 2),
    '',
    '## A3 (Técnico — cita textual, NO modificar):',
    JSON.stringify(input.a3, null, 2),
    '',
    '## Debate (si existe):',
    input.debate ? JSON.stringify(input.debate, null, 2) : 'No se disparó debate.',
    '',
    'Calcula la confluencia y emite la recomendación consolidada según el formato.',
  ].join('\n');

  return runAgent({
    agentName: 'A4',
    systemPrompt: A4_SYSTEM_PROMPT,
    userMessage,
    schema: A4_OUTPUT_SCHEMA,
    model: MODELS.OPUS,
    maxTokens: 2048,
    temperature: 0.3,
  });
}
