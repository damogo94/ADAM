import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { A1_SYSTEM_PROMPT } from './prompt';
import { A1_OUTPUT_SCHEMA, type A1Output } from './schema';

export interface A1Input {
  ticker: string;
  /** Datos crudos de mercado (precio, fundamentales, news) que A1 puede usar. */
  market_snapshot: {
    quote: { current: number; change_pct_24h: number; change_pct_7d: number; currency: string };
    fundamentals: Record<string, number | null>;
    news: { headline: string; source: string; url: string }[];
  };
}

export async function runA1(input: A1Input, onUsage?: (u: AgentUsage) => void): Promise<A1Output> {
  const userMessage = [
    `Activo a analizar: ${input.ticker}`,
    '',
    'Datos de mercado:',
    JSON.stringify(input.market_snapshot, null, 2),
  ].join('\n');

  return runAgent({
    agentName: 'A1',
    systemPrompt: A1_SYSTEM_PROMPT,
    userMessage,
    schema: A1_OUTPUT_SCHEMA,
    model: MODELS.SONNET,
    onUsage,
  });
}
