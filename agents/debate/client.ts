import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayISO } from '@/lib/utils';
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
export async function runDebate(input: DebateInput, onUsage?: (u: AgentUsage) => void): Promise<DebateOutput> {
  const userMessage = [
    `# FECHA ACTUAL: ${todayISO()}`,
    'Tu validación se emite con datos de HOY. Confronta A1 y A2 referidos',
    'al contexto presente, no a snapshots históricos.',
    '',
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
    // Antes OPUS. Cambiado a SONNET para caber en maxDuration=60s del
    // plan Hobby de Vercel. Opus en este paso costaba ~25s + retries y
    // mataba lambdas con timeout. Sonnet ~12s, calidad de "cross-examine
    // 2 outputs" es indistinguible para este task. Upgrade a OPUS cuando
    // movamos a Pro plan (maxDuration 300s).
    model: MODELS.SONNET,
    maxTokens: 2048,
    temperature: 0.4,
    onUsage,
  });
}
