import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayISO } from '@/lib/utils';
import { DEBATE_SYSTEM_PROMPT } from './prompt';
import { DEBATE_OUTPUT_SCHEMA, type DebateOutput } from './schema';
import type { A1Output_t as A1Output, A2Output_t as A2Output } from '@/agents/shared/types';

export interface DebateInput {
  a1: A1Output;
  a2: A2Output;
}

/**
 * Trim de A1 para el debate — solo las conclusiones, no los datos crudos.
 * Razón: el debate razona sobre narrativas y direcciones, no necesita
 * fundamentals.ev_ebitda ni news[].url. Ahorra ~40% de input tokens.
 */
function trimA1ForDebate(a1: A1Output) {
  return {
    ticker: a1.ticker,
    asset_type: a1.asset_type,
    precio_actual: a1.price.current,
    cambio_24h_pct: a1.price.change_pct_24h,
    anomaly_detected: a1.anomaly_detected,
    anomaly_type: a1.anomaly_type,
    anomaly_description: a1.anomaly_description,
    confidence: a1.confidence,
    narrative: a1.narrative,
    // skip: news (10 items), fundamentals completo, price.change_pct_7d
  };
}

function trimA2ForDebate(a2: A2Output) {
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
    // skip: factores_clave (8 items), correlaciones (6 items), prevision, fed_rate, 10y_yield
  };
}

/**
 * ⚠️ El debate NO recibe ni envía nada a A3. Sólo cruza A1 y A2.
 */
export async function runDebate(input: DebateInput, onUsage?: (u: AgentUsage) => void): Promise<DebateOutput> {
  const userMessage = [
    `# FECHA ACTUAL: ${todayISO()}`,
    'Tu validación se emite con datos de HOY. Confronta A1 y A2 referidos',
    'al contexto presente, no a snapshots históricos.',
    '',
    `Ticker: ${input.a1.ticker}`,
    '',
    '## Output A1 (Activo · Micro) — extracto:',
    JSON.stringify(trimA1ForDebate(input.a1), null, 2),
    '',
    '## Output A2 (Macro) — extracto:',
    JSON.stringify(trimA2ForDebate(input.a2), null, 2),
    '',
    'Contrasta ambos análisis y produce el output de debate según el formato indicado.',
  ].join('\n');

  return runAgent({
    agentName: 'DEBATE',
    systemPrompt: DEBATE_SYSTEM_PROMPT,
    userMessage,
    schema: DEBATE_OUTPUT_SCHEMA,
    // Antes OPUS. Cambiado a SONNET para caber en maxDuration=60s del
    // plan Hobby de Vercel. Opus en este paso costaba ~25s + retries y
    // mataba lambdas con timeout. Sonnet ~12s, calidad de "cross-examine
    // 2 outputs" es indistinguible para este task. Upgrade a OPUS cuando
    // movamos a Pro plan (maxDuration 300s).
    model: MODELS.SONNET,
    maxTokens: 2048,
    temperature: 0.4,
    onUsage,
  });
}
