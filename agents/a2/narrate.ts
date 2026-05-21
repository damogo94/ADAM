/**
 * A.D.A.M. — narrateA2
 *
 * Refactor Fase 1 · Tarea 1.5 (pipeline integrado)
 *
 * Versión narrate-only de A2 — usa el schema strict consolidado y acepta
 * traceId. NO toca `agents/a2/client.ts` viejo (sigue activo para los
 * endpoints individuales).
 */

import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayContext, todayISO } from '@/lib/utils';
import { A2_SYSTEM_PROMPT } from './prompt';
import { A2Output, type A2Output_t, type MarketSnapshot } from '@/agents/shared/types';

export interface NarrateA2Options {
  traceId?: string;
  onUsage?: (u: AgentUsage) => void;
}

export async function narrateA2(
  ticker: string,
  snapshot: MarketSnapshot,
  options: NarrateA2Options = {}
): Promise<A2Output_t> {
  const { traceId, onUsage } = options;

  const userMessage = [
    `# FECHA ACTUAL: ${todayContext()} · ${todayISO()}`,
    `# TRACE: ${traceId ?? 'no-trace'}`,
    'Tu contexto macro debe ser EL DE HOY. Régimen de tipos vigente,',
    'inflación más reciente, ciclo económico actual. NO uses tu training',
    'antiguo como si fuera la macro de ahora.',
    '',
    `Activo a contextualizar macroeconómicamente: ${ticker}`,
    '',
    'Snapshot macro disponible (puede estar parcial — completa con tu',
    'conocimiento DE LA SITUACIÓN ACTUAL):',
    JSON.stringify(snapshot.macro_snapshot, null, 2),
  ].join('\n');

  return runAgent({
    agentName: 'A2',
    systemPrompt: A2_SYSTEM_PROMPT,
    userMessage,
    schema: A2Output,
    // 2500 (antes 3000). El prompt pide narrativa max 1200 chars +
    // macro_context.narrative 1000 chars + opportunity_description 600,
    // estructura ~500 tokens → total tipico ~1500-1800 tokens. 2500
    // da cushion sin invitar al modelo a alargarse y comerse el budget
    // de timeout (visto P99 ~26-28s causando timeouts en prod).
    maxTokens: 2500,
    onUsage,
  });
}
