import { runAgent, MODELS } from '@/lib/anthropic';
import { CMT_SYSTEM_PROMPT } from './prompt';
import { CMT_OUTPUT_SCHEMA, type CMTOutput } from './schema';

/**
 * ⚠️ Aislamiento idéntico a A3: SOLO ticker + OHLCV.
 * Cualquier intento de pasar news/macro/sentiment se rechaza aquí.
 */
export interface CMTInput {
  ticker: string;
  ohlcv: {
    timeframe: string;
    candles: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  }[];
}

export async function runCMT(input: CMTInput): Promise<CMTOutput> {
  const allowedKeys = new Set(['ticker', 'ohlcv']);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `[CMT isolation violation] Campo no permitido: "${key}". CMT sólo acepta ticker + ohlcv.`
      );
    }
  }

  const userMessage = [
    `Ticker: ${input.ticker}`,
    '',
    'OHLCV multi-timeframe (única información disponible):',
    JSON.stringify(input.ohlcv, null, 2),
  ].join('\n');

  return runAgent({
    agentName: 'CMT',
    systemPrompt: CMT_SYSTEM_PROMPT,
    userMessage,
    schema: CMT_OUTPUT_SCHEMA,
    model: MODELS.HAIKU,
    temperature: 0.2,
    maxTokens: 2048,
  });
}
