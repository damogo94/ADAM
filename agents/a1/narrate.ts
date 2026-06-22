/**
 * A.D.A.M. — narrateA1
 *
 * Refactor Fase 1 · Tarea 1.5 (pipeline integrado)
 *
 * Versión "narrate-only" del agente A1. Mantiene la misma firma semántica
 * que `runA1` (recibe ticker + market_snapshot, devuelve A1Output_t) pero:
 *   1. Acepta un `traceId` para logging estructurado correlacionado.
 *   2. Importa el schema NUEVO de `agents/shared/types.ts` (strict).
 *   3. NO es invocado por endpoints individuales — solo por el pipeline.
 *      El viejo `agents/a1/client.ts runA1` sigue activo en
 *      `/api/agents/a1/route.ts` para no romper la integración existente.
 *
 * Cuando el pipeline esté validado y migremos endpoints, este archivo
 * reemplaza a `client.ts`.
 */

import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayContext, todayISO } from '@/lib/utils';
import { A1_SYSTEM_PROMPT } from './prompt';
import { A1Output, type A1Output_t, type MarketSnapshot } from '@/agents/shared/types';

export interface NarrateA1Options {
  /** UUID propagado por el pipeline para correlacionar logs. */
  traceId?: string;
  /** Callback opcional para tracking de coste. */
  onUsage?: (u: AgentUsage) => void;
}

export async function narrateA1(
  ticker: string,
  snapshot: MarketSnapshot,
  options: NarrateA1Options = {}
): Promise<A1Output_t> {
  const { traceId, onUsage } = options;

  // Subset del snapshot que A1 ve. NO le pasamos macro ni ohlcv.
  // El bloque `crypto` (CoinGecko) solo se incluye si el activo es crypto —
  // son los fundamentals que SÍ aplican ahí (Finnhub no cubre crypto).
  const market_snapshot = {
    quote: snapshot.quote,
    fundamentals: snapshot.fundamentals,
    ...(snapshot.crypto ? { crypto: snapshot.crypto } : {}),
    news: snapshot.news,
  };

  // Ancla temporal explícita — patrón heredado del cliente actual.
  const userMessage = [
    `# FECHA ACTUAL: ${todayContext()} · ${todayISO()}`,
    `# TRACE: ${traceId ?? 'no-trace'}`,
    'Tu análisis debe interpretarse a esta fecha exacta. Cualquier precio',
    'o ratio aquí es del cierre más reciente disponible. NO uses datos',
    'de tu training previos a esta fecha como si fueran actuales.',
    '',
    `Activo a analizar: ${ticker} (moneda: ${snapshot.quote.currency})`,
    '',
    'Datos de mercado (snapshot fresco hoy):',
    JSON.stringify(market_snapshot, null, 2),
    '',
    'Las noticias incluidas son de las últimas 48h (campo age_hours).',
    'Si una noticia tiene age_hours > 24, márcala como "contexto reciente"',
    'pero NO como driver inmediato de precio.',
  ].join('\n');

  return runAgent({
    agentName: 'A1',
    systemPrompt: A1_SYSTEM_PROMPT,
    userMessage,
    schema: A1Output,
    model: MODELS.HAIKU,
    maxTokens: 3000,
    onUsage,
  });
}
