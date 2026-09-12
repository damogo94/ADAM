/**
 * A.D.A.M. — narrateA2
 *
 * Refactor Fase 1 · Tarea 1.5 (pipeline integrado)
 *
 * Versión narrate-only de A2 — usa el schema strict consolidado y acepta
 * traceId. NO toca `agents/a2/client.ts` viejo (sigue activo para los
 * endpoints individuales).
 *
 * Cache (sesión 2026-05-21): A2 es casi-determinístico sobre
 * (ticker, macro.as_of). Antes de llamar a Anthropic, miramos cache.
 * Hit → 0 tokens + ~50ms. Miss → call + persist. El cache se invalida
 * orgánicamente cuando FRED rota `as_of`.
 */

import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayContext, todayISO } from '@/lib/utils';
import { A2_SYSTEM_PROMPT } from './prompt';
import { A2Output, type A2Output_t, type MarketSnapshot } from '@/agents/shared/types';
import { readA2Cache, writeA2Cache } from '@/lib/a2-cache';

export interface NarrateA2Options {
  traceId?: string;
  onUsage?: (u: AgentUsage) => void;
  /**
   * Timeout per-call. Default 25s (DEFAULT_TIMEOUT_MS de lib/anthropic.ts)
   * para callers dentro del pipeline /run. Lo suben a 45s los callers con
   * lambda holgado: /api/agents/a2 standalone (60s dedicados), el cron
   * a2-reconcile y el cron watchlist-scan vía `RunADAMOptions.a2TimeoutMs`
   * (ambos con maxDuration 300s).
   */
  timeoutMs?: number;
}

export async function narrateA2(
  ticker: string,
  snapshot: MarketSnapshot,
  options: NarrateA2Options = {}
): Promise<A2Output_t> {
  const { traceId, onUsage, timeoutMs } = options;

  // ── Cache lookup (best-effort) ─────────────────────────────────
  // Solo cacheamos cuando el snapshot tiene `as_of`. Si está vacío
  // (FRED caído sin stale fallback), saltamos cache para no fijar
  // narrative de "sin datos" a una fecha.
  const macroAsOf = readAsOf(snapshot.macro_snapshot);
  if (macroAsOf) {
    const cached = await readA2Cache(ticker, macroAsOf);
    if (cached) {
      // eslint-disable-next-line no-console
      console.log(
        `[A2] ${traceId ?? 'no-trace'} cache hit ticker=${ticker} as_of=${macroAsOf}`
      );
      // Override ticker en cached por si la entrada de cache se popularizó
      // desde un caller distinto (paranoia — el PK ya garantiza).
      return { ...cached, ticker };
    }
  }

  // ── Cache miss → llamada normal a Anthropic ────────────────────
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

  const output = await runAgent({
    agentName: 'A2',
    systemPrompt: A2_SYSTEM_PROMPT,
    userMessage,
    schema: A2Output,
    model: MODELS.SONNET,
    // 2500 (antes 3000). El prompt pide narrativa max 1200 chars +
    // macro_context.narrative 1000 chars + opportunity_description 600,
    // estructura ~500 tokens → total tipico ~1500-1800 tokens. 2500
    // da cushion sin invitar al modelo a alargarse y comerse el budget
    // de timeout. Medido en producción (plan de precisión 2026-09, R4/R5):
    // con el timeout por defecto de 25s A2 falla 257/260 llamadas (el P50
    // de latencia del análisis completo ronda ~58s) — NO es un P99 de
    // 26-28s. El default NO se sube (presupuesto 60s de /run); los callers
    // con lambda de 300s (crons) y el standalone pasan 45s vía timeoutMs.
    maxTokens: 2500,
    onUsage,
    timeoutMs,
  });

  // ── Persist al cache (best-effort, no bloquea respuesta) ───────
  if (macroAsOf) {
    void writeA2Cache(ticker, macroAsOf, output);
  }

  return output;
}

/**
 * Extrae `as_of` del snapshot macro de forma defensiva. El tipo
 * `MarketSnapshot.macro_snapshot` es `Record<string, unknown>` para
 * tolerancia con providers, así que validamos en runtime.
 */
function readAsOf(macroSnapshot: unknown): string | null {
  if (!macroSnapshot || typeof macroSnapshot !== 'object') return null;
  const asOf = (macroSnapshot as { as_of?: unknown }).as_of;
  if (typeof asOf !== 'string') return null;
  // Validación mínima — formato YYYY-MM-DD (que es lo que devuelve macro.ts).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  return asOf;
}
