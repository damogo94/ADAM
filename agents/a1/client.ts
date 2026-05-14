import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayContext, todayISO } from '@/lib/utils';
import { A1_SYSTEM_PROMPT } from './prompt';
import { A1_OUTPUT_SCHEMA, type A1Output } from './schema';

export interface A1Input {
  ticker: string;
  /** Datos crudos de mercado (precio, fundamentales, news) que A1 puede usar. */
  market_snapshot: {
    quote: { current: number; change_pct_24h: number; change_pct_7d: number; currency: string };
    fundamentals: Record<string, number | null>;
    news: { headline: string; source: string; url: string; publishedAt?: number; published_iso?: string | null; age_hours?: number | null }[];
  };
}

export async function runA1(input: A1Input, onUsage?: (u: AgentUsage) => void): Promise<A1Output> {
  // Anclar fecha actual — LLMs sin esto pueden mezclar entrenamiento antiguo
  // con datos del usuario. El análisis DEBE referirse a hoy.
  const userMessage = [
    `# FECHA ACTUAL: ${todayContext()} · ${todayISO()}`,
    'Tu análisis debe interpretarse a esta fecha exacta. Cualquier precio',
    'o ratio aquí es del cierre más reciente disponible. NO uses datos',
    'de tu training previos a esta fecha como si fueran actuales.',
    '',
    `Activo a analizar: ${input.ticker} (moneda: ${input.market_snapshot.quote.currency})`,
    '',
    'Datos de mercado (snapshot fresco hoy):',
    JSON.stringify(input.market_snapshot, null, 2),
    '',
    'Las noticias incluidas son de las últimas 48h (campo age_hours).',
    'Si una noticia tiene age_hours > 24, márcala como "contexto reciente"',
    'pero NO como driver inmediato de precio.',
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
