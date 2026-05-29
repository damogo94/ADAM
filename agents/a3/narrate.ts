/**
 * A.D.A.M. — narrateA3
 *
 * Refactor Fase 1 · Tarea 1.5 (pipeline integrado)
 *
 * Recibe el output de `computeTechnical()` (ya calculado, sin narrative) y
 * llama al LLM SOLO para producir el campo `narrative`. Luego merge.
 *
 * Beneficio enorme:
 *   - 0 hallucination de SMAs, ATR, niveles, R/B (vienen del compute).
 *   - LLM más pequeño basta (Haiku — solo narra prosa).
 *   - Si el LLM falla parseando, devolvemos el compute output con un
 *     narrative degradado en lugar de tirar todo. Esto preserva la
 *     información técnica determinística aunque la prosa falle.
 *
 * Importante: este archivo NO replaza a `client.ts` viejo en endpoints.
 * Lo invoca solo el pipeline.
 */

import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayISO } from '@/lib/utils';
import { A3_NARRATE_SYSTEM_PROMPT } from './narrate.prompt';
import { computeTechnical, type ComputeTechnicalOutput } from './compute';
import {
  A3NarrativeOnly,
  type A3Output_t,
  type OHLCVCandle_t,
  type Timeframe_t,
} from '@/agents/shared/types';

export interface NarrateA3Input {
  ticker: string;
  ohlcv: OHLCVCandle_t[];
  timeframe?: Timeframe_t;
  /** Velas intradía hourly (≥24) para análisis multi-timeframe. Opcional. */
  intraday?: OHLCVCandle_t[];
}

export interface NarrateA3Options {
  traceId?: string;
  onUsage?: (u: AgentUsage) => void;
}

/**
 * Pipeline completo de A3: compute (sin LLM) + narrate (LLM solo prosa).
 *
 * Si el narrate del LLM falla, devolvemos el output con un narrative
 * descriptivo generado en código. Esto evita perder TODO el análisis
 * técnico (que sigue siendo válido aunque la prosa falle).
 */
export async function narrateA3(
  input: NarrateA3Input,
  options: NarrateA3Options = {}
): Promise<A3Output_t> {
  // ── Aislamiento de A3 (capa 2, defensa en profundidad) ──
  // Igual que el legacy runA3: rechazamos cualquier clave fuera del set OHLCV
  // ANTES de tocar compute o LLM. El pipeline ya pasa solo estas claves; el
  // guard atrapa un futuro refactor que cuele narrative context (a1/a2 output,
  // news, macro, sentiment). El tipado TS solo no basta: un `as any` upstream
  // lo saltaría sin este chequeo runtime.
  const allowedKeys = new Set(['ticker', 'ohlcv', 'timeframe', 'intraday']);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `[A3 isolation violation] Campo no permitido en narrateA3 input: "${key}". ` +
          `A3 sólo acepta ticker + ohlcv (+ timeframe/intraday). Revisa el caller.`
      );
    }
  }

  const { traceId, onUsage } = options;
  const timeframe = input.timeframe ?? '1D';

  // 1. Compute determinístico
  const computeOut: ComputeTechnicalOutput = computeTechnical({
    ticker: input.ticker,
    ohlcv: input.ohlcv,
    timeframe,
    intraday: input.intraday,
  });

  // 2. LLM narrate — solo prosa
  const userMessage = [
    `# FECHA ACTUAL: ${todayISO()}`,
    `# TRACE: ${traceId ?? 'no-trace'}`,
    'Análisis técnico YA CALCULADO. Tu tarea: escribir SOLO la narrativa.',
    '',
    JSON.stringify(computeOut, null, 2),
  ].join('\n');

  let narrative: string;
  try {
    const narrated = await runAgent({
      agentName: 'A3',
      systemPrompt: A3_NARRATE_SYSTEM_PROMPT,
      userMessage,
      schema: A3NarrativeOnly,
      model: MODELS.HAIKU, // ADR-001: Haiku para narración pura sobre compute determinista
      temperature: 0.3,
      maxTokens: 1500, // narrative ≤2500 chars cabe sobrado en 1500 tokens
      onUsage,
    });
    narrative = narrated.narrative;
  } catch (err) {
    // Fallback: narrativa generada deterministically con los números.
    // Mantenemos el output operativo aunque el LLM falle.
    // eslint-disable-next-line no-console
    console.warn(
      `[A3] narrate failed, using fallback narrative. trace=${traceId ?? 'none'}`,
      err instanceof Error ? err.message : err
    );
    narrative = synthesizeFallbackNarrative(computeOut);
  }

  // 3. Merge compute + narrative
  return {
    ...computeOut,
    narrative,
  };
}

/**
 * Narrativa de fallback determinística. Usa los campos ya calculados para
 * generar 2-3 frases mínimamente informativas. No es bonita, pero no falla.
 */
function synthesizeFallbackNarrative(out: ComputeTechnicalOutput): string {
  const partes: string[] = [];
  partes.push(
    `${out.ticker} en tendencia ${out.tendencia.primaria} con fuerza ${out.tendencia.fuerza}/5.`
  );
  if (out.soportes.length > 0) {
    partes.push(`Soporte de referencia ${out.soportes[0]}, resistencia ${out.resistencias[0] ?? 'sin definir'}.`);
  }
  if (out.patron_detectado) {
    partes.push(`Patrón detectado: ${out.patron_detectado}.`);
  }
  partes.push(
    out.operativa.signal === 'hold'
      ? 'Operativa: hold (sin trigger inmediato).'
      : `Operativa: ${out.operativa.signal} con R/B ${out.operativa.ratio_riesgo_beneficio ?? 'n/a'}.`
  );
  return partes.join(' ').slice(0, 2500);
}
