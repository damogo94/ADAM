import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayISO } from '@/lib/utils';
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

export async function runA3(input: A3Input, onUsage?: (u: AgentUsage) => void): Promise<A3Output> {
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

  // Fecha actual — A3 sigue aislado (no recibe news/macro/sentiment), pero
  // SÍ debe saber qué día es para que entrada/stop/target sean coherentes
  // con la última vela de OHLCV. Sin fecha, podría tratar candles antiguos
  // como "actuales" y emitir niveles obsoletos.
  const userMessage = [
    `# FECHA ACTUAL: ${todayISO()}`,
    'Analiza el gráfico con referencia a esta fecha. La última vela de los',
    'datos OHLCV abajo corresponde al cierre más reciente disponible.',
    'No infieras dirección futura desde patrones de tu training que',
    'pueden estar invalidados por el precio actual.',
    '',
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
    onUsage,
  });
}
