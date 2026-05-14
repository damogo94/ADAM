import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayContext, todayISO } from '@/lib/utils';
import { A4_SYSTEM_PROMPT } from './prompt';
import { A4_OUTPUT_SCHEMA, type A4Output } from './schema';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';
import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';

/**
 * A4 puede recibir agents que NO ejecutaron (fallo transitorio, rate-limit, etc).
 * Cualquier subset >=1 es válido; el prompt instruye a A4 a degradar la confluencia
 * y a reflejarlo en `resumen_*`.
 */
export interface A4Input {
  ticker: string;
  a1: A1Output | null;
  a2: A2Output | null;
  a3: A3Output | null;
  debate: DebateOutput | null;
  /** Mensajes de los agentes que fallaron — para que A4 contextualice. */
  failures?: { agent: string; message: string }[];
}

/**
 * Trim helpers — A4 razona sobre conclusiones y narrativas, no sobre datos crudos.
 * Pasando solo lo esencial reduce input ~50% (de ~3000 a ~1500 tokens) sin perder
 * información de decisión. A3 SÍ se pasa completo porque A4 lo cita textualmente.
 */
function trimA1ForA4(a1: A1Output) {
  return {
    ticker: a1.ticker,
    asset_type: a1.asset_type,
    precio: a1.price.current,
    cambio_24h_pct: a1.price.change_pct_24h,
    currency: a1.price.currency,
    anomaly_detected: a1.anomaly_detected,
    anomaly_type: a1.anomaly_type,
    anomaly_description: a1.anomaly_description,
    confidence: a1.confidence,
    narrative: a1.narrative,
  };
}
function trimA2ForA4(a2: A2Output) {
  return {
    ticker: a2.ticker,
    ciclo_economico: a2.macro_context.ciclo_economico,
    regimen_tipos: a2.macro_context.regimen_tipos,
    inflacion_trend: a2.macro_context.inflacion_trend,
    macro_narrative: a2.macro_context.narrative,
    opportunity_detected: a2.opportunity_detected,
    opportunity_description: a2.opportunity_description,
    confidence: a2.confidence,
    narrative: a2.narrative,
  };
}
function trimDebateForA4(d: DebateOutput) {
  return {
    convergence_score: d.convergence_score,
    direccion: d.direccion,
    oportunidad_validada: d.oportunidad_validada,
    punto_critico: d.punto_critico_de_debate,
    recomendacion: d.recomendacion_consolidada,
    factor_invalidante: d.factor_invalidante,
  };
}

/**
 * A4 ensambla pero NO envía nada de vuelta a A3. A3 sigue aislado para futuros
 * análisis. Esta función sólo produce el output al usuario.
 */
export async function runA4(input: A4Input, onUsage?: (u: AgentUsage) => void): Promise<A4Output> {
  const part = (label: string, value: unknown, note?: string) => {
    if (value === null || value === undefined) {
      return [`## ${label}:`, `(agente no disponible en este análisis${note ? ` — ${note}` : ''})`].join('\n');
    }
    return [`## ${label}:`, JSON.stringify(value, null, 2)].join('\n');
  };

  const a1Note = input.failures?.find((f) => f.agent === 'A1')?.message;
  const a2Note = input.failures?.find((f) => f.agent === 'A2')?.message;
  const a3Note = input.failures?.find((f) => f.agent === 'A3')?.message;

  const userMessage = [
    `# FECHA ACTUAL: ${todayContext()} · ${todayISO()}`,
    'La recomendación se emite con datos de HOY. La acción sugerida y',
    'los niveles son válidos a esta fecha. NO recicles patrones de tu',
    'training previos como si fueran el contexto presente.',
    '',
    `Ticker: ${input.ticker}`,
    '',
    part('A1 (Activo) — extracto', input.a1 ? trimA1ForA4(input.a1) : null, a1Note),
    '',
    part('A2 (Macro) — extracto', input.a2 ? trimA2ForA4(input.a2) : null, a2Note),
    '',
    '## A3 (Técnico — cita textual, NO modificar):',
    input.a3 ? JSON.stringify(input.a3, null, 2) : `(agente no disponible${a3Note ? ` — ${a3Note}` : ''})`,
    '',
    '## Debate (si existe) — extracto:',
    input.debate ? JSON.stringify(trimDebateForA4(input.debate), null, 2) : 'No se disparó debate.',
    '',
    input.failures && input.failures.length > 0
      ? `⚠️ NOTA: ${input.failures.length} agente(s) fallaron transitoriamente — refleja esto bajando la confluencia y describiendo qué dimensión falta en los resumen_*.`
      : '',
    'Calcula la confluencia y emite la recomendación consolidada según el formato.',
  ].join('\n');

  return runAgent({
    agentName: 'A4',
    systemPrompt: A4_SYSTEM_PROMPT,
    userMessage,
    schema: A4_OUTPUT_SCHEMA,
    // Antes OPUS. Cambiado a SONNET para caber en maxDuration=60s del
    // plan Hobby. Opus al final del pipeline (después de A1+A2+A3+Debate)
    // consumía los últimos 20-25s y mataba lambdas. Sonnet hace el
    // ensamblado + confluencia en ~10s con calidad suficiente.
    // Upgrade a OPUS cuando Vercel Pro permita maxDuration 300s.
    model: MODELS.SONNET,
    maxTokens: 2048,
    temperature: 0.3,
    onUsage,
  });
}
