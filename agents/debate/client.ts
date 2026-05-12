import { runAgent, MODELS } from '@/lib/anthropic';
import { DEBATE_SYSTEM_PROMPT } from './prompt';
import { DEBATE_OUTPUT_SCHEMA, type DebateOutput } from './schema';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';

export interface DebateInput {
  a1: A1Output;
  a2: A2Output;
}

/**
 * ⚠️ El debate NO recibe ni envía nada a A3. Sólo cruza A1 y A2.
 */
export async function runDebate(input: DebateInput): Promise<DebateOutput> {
  const userMessage = [
    `Ticker: ${input.a1.ticker}`,
    '',
    '## Output A1 (Activo · Micro):',
    JSON.stringify(input.a1, null, 2),
    '',
    '## Output A2 (Macro):',
    JSON.stringify(input.a2, null, 2),
    '',
    'Contrasta ambos análisis y produce el output de debate según el formato indicado.',
  ].join('\n');

  return runAgent({
    agentName: 'DEBATE',
    systemPrompt: DEBATE_SYSTEM_PROMPT,
    userMessage,
    schema: DEBATE_OUTPUT_SCHEMA,
    model: MODELS.OPUS,
    maxTokens: 2048,
    temperature: 0.4,
  });
}
