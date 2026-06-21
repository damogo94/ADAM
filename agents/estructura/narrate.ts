/**
 * A.D.A.M. — narrateEstructura
 *
 * Patrón idéntico a `narrateA3`: el compute determinista
 * (`computeEstructura`) ya produjo TODO menos `narrative`; el LLM (Haiku) solo
 * escribe la prosa. Si el LLM falla, una narrativa de fallback determinista
 * preserva el plan (los números siguen siendo válidos aunque la prosa falle).
 */

import { runAgent, MODELS, type AgentUsage } from '@/lib/anthropic';
import { todayISO } from '@/lib/utils';
import { ESTRUCTURA_NARRATE_SYSTEM_PROMPT } from './narrate.prompt';
import { computeEstructura, type ComputeEstructuraInput } from './compute';
import {
  EstructuraNarrativeOnly,
  EstructuraOutput,
  type EstructuraComputeOutput_t,
  type EstructuraOutput_t,
} from './schema';

export type NarrateEstructuraInput = ComputeEstructuraInput;

export interface NarrateEstructuraOptions {
  traceId?: string;
  onUsage?: (u: AgentUsage) => void;
}

const CLAVES_PERMITIDAS = new Set(['ticker', 'ohlcv', 'intraday', 'vanillaWalls']);

export async function narrateEstructura(
  input: NarrateEstructuraInput,
  options: NarrateEstructuraOptions = {}
): Promise<EstructuraOutput_t> {
  // Aislamiento (defensa en profundidad, igual que A3): el compute ya guarda,
  // pero el guard aquí atrapa un caller que cuele contexto narrativo.
  for (const key of Object.keys(input)) {
    if (!CLAVES_PERMITIDAS.has(key)) {
      throw new Error(
        `[Estructura isolation violation] Campo no permitido en narrateEstructura: "${key}".`
      );
    }
  }

  const { traceId, onUsage } = options;

  // 1. Compute determinista
  const compute = computeEstructura(input);

  // 2. LLM narrate — solo prosa
  const userMessage = [
    `# FECHA ACTUAL: ${todayISO()}`,
    `# TRACE: ${traceId ?? 'no-trace'}`,
    'Plan de estructura YA CALCULADO. Tu tarea: escribir SOLO la narrativa.',
    '',
    JSON.stringify(compute, null, 2),
  ].join('\n');

  let narrative: string;
  try {
    const narrated = await runAgent({
      agentName: 'Estructura',
      systemPrompt: ESTRUCTURA_NARRATE_SYSTEM_PROMPT,
      userMessage,
      schema: EstructuraNarrativeOnly,
      model: MODELS.HAIKU, // ADR-001: Haiku para narración pura sobre compute determinista
      temperature: 0.3,
      maxTokens: 1500,
      onUsage,
    });
    narrative = narrated.narrative;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Estructura] narrate failed, using fallback. trace=${traceId ?? 'none'}`,
      err instanceof Error ? err.message : err
    );
    narrative = synthesizeFallbackNarrative(compute);
  }

  // 3. Merge compute + narrative y validación final del contrato.
  return EstructuraOutput.parse({ ...compute, narrative });
}

/**
 * Narrativa de fallback determinista a partir del plan ya calculado. No es
 * bonita, pero no falla y respeta el contrato (≥20 chars).
 */
export function synthesizeFallbackNarrative(out: EstructuraComputeOutput_t): string {
  const partes: string[] = [];
  const d = out.contexto.daily;
  partes.push(`${out.ticker}: Daily ${d.direccion} en ${d.fase}.`);

  const z = out.rango_operativo.zona_retesteo;
  if (z) partes.push(`Zona de retesteo en ${z.nivel} (${z.descripcion})`);

  if (out.confluencia.precio_redondo != null) {
    const muro = out.confluencia.vanilla_disponible
      ? `, muro vanilla ${out.confluencia.barrera_vanilla ?? 'no próximo'}`
      : ' (muro vanilla pendiente de datos de opciones)';
    partes.push(`Redondo ${out.confluencia.precio_redondo}${muro}.`);
  }

  const s = out.setup;
  const g = out.gestion;
  if (s.estado === 'listo' && g.entrada != null) {
    partes.push(
      `Setup de ${s.direccion} ${g.entry_type === 'market' ? 'a mercado' : 'en límite'} ${g.entrada} · stop ${g.stop_loss} · target ${g.take_profit} (R/B ${g.ratio_riesgo_beneficio}), gatillo ${s.gatillo}.`
    );
  } else if (s.estado === 'esperando_confirmacion') {
    partes.push(`Precio en zona de ${s.direccion}; falta gatillo (M/W o ruptura) en ${s.timeframe_entrada ?? 'la entrada'}.`);
  } else if (s.estado === 'esperando_zona') {
    partes.push(`Sesgo de ${s.direccion}; esperando el retroceso a la zona de retesteo.`);
  } else {
    partes.push('Sin setup operativo válido por ahora.');
  }

  partes.push(`Confianza ${out.confianza}/100.`);
  return partes.join(' ').slice(0, 2500);
}
