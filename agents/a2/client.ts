import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayContext, todayISO } from '@/lib/utils';
import { A2_SYSTEM_PROMPT } from './prompt';
import { A2_OUTPUT_SCHEMA, type A2Output } from './schema';

export interface A2Input {
  ticker: string;
  /** Snapshot macro relevante. A2 lo usa como punto de partida pero puede inferir más. */
  macro_snapshot: {
    fed_funds_rate_pct?: number;
    us_10y_yield_pct?: number;
    cpi_yoy_pct?: number;
    pmi_manufacturing?: number;
    [k: string]: number | undefined;
  };
}

export async function runA2(input: A2Input, onUsage?: (u: AgentUsage) => void): Promise<A2Output> {
  const userMessage = [
    `# FECHA ACTUAL: ${todayContext()} · ${todayISO()}`,
    'Tu contexto macro debe ser EL DE HOY. Régimen de tipos vigente,',
    'inflación más reciente, ciclo económico actual. NO uses tu training',
    'antiguo como si fuera la macro de ahora.',
    '',
    `Activo a contextualizar macroeconómicamente: ${input.ticker}`,
    '',
    'Snapshot macro disponible (puede estar parcial — completa con tu',
    'conocimiento DE LA SITUACIÓN ACTUAL):',
    JSON.stringify(input.macro_snapshot, null, 2),
  ].join('\n');

  return runAgent({
    agentName: 'A2',
    systemPrompt: A2_SYSTEM_PROMPT,
    userMessage,
    schema: A2_OUTPUT_SCHEMA,
    model: MODELS.SONNET,
    onUsage,
  });
}
