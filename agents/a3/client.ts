import { runAgent, MODELS } from '@/lib/anthropic';
import { A3_SYSTEM_PROMPT } from './prompt';
import { A3_OUTPUT_SCHEMA, type A3Output } from './schema';

/**
 * ⚠️ AISLAMIENTO DE A3 — REGLA ABSOLUTA #1 ⚠️
 *
 * runA3() ACEPTA EXCLUSIVAMENTE un ticker y datos OHLCV crudos.
 * NO ACEPTA: outputs de A1, A2, news, macro, sentiment, ni cualquier otro contexto.
 *
 * Esta firma de función es parte del enforcement de tres capas. NO añadir
 * parámetros adicionales al input sin revisión explícita del owner del proyecto.
 *
 * Si necesitas pasar más data, debe ser strict OHLCV — y debe quedar claro en el
 * code review que no introduce bias narrativo.
 */
export interface A3Input {
  ticker: string;
  /** Datos OHLCV crudos. Multi-timeframe permitido. NADA más. */
  ohlcv: {
    timeframe: string;
    candles: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  }[];
}

export async function runA3(input: A3Input): Promise<A3Output> {
  // Defensa adicional: comprobar que no se cuelan campos no permitidos.
  const allowedKeys = new Set(['ticker', 'ohlcv']);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `[A3 isolation violation] Campo no permitido en A3 input: "${key}". ` +
          `A3 sólo acepta ticker + ohlcv. Revisa el caller.`
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
    agentName: 'A3',
    systemPrompt: A3_SYSTEM_PROMPT,
    userMessage,
    schema: A3_OUTPUT_SCHEMA,
    model: MODELS.SONNET,
    temperature: 0.2, // technical analysis: lower variance
  });
}
