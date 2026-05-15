/**
 * A.D.A.M. — Parser de outputs de agentes
 *
 * Refactor Fase 1 · Tarea 1.1
 *
 * Helper genérico para parsear y validar respuestas crudas de los LLM
 * contra un schema Zod. Maneja:
 *   1. JSON fences (```json...```) que el modelo pueda añadir aunque le
 *      digamos que no.
 *   2. Texto antes/después del bloque JSON.
 *   3. Errores de JSON.parse → null + log.
 *   4. Errores de schema.parse → null + log con los primeros 5 issues.
 *
 * Decisión de diseño: devuelve `T | null` en vez de tirar. El caller decide
 * si reintentar, degradar, o fallar el pipeline. Esto encaja con el patrón
 * Promise.allSettled del orquestador A4, donde un agente caído NO debe
 * matar al resto.
 *
 * Para retry-on-parse-failure con multiple intentos, ver Tarea 2.2
 * (`callAgentWithValidation`). Aquí solo nos ocupamos del parse-once.
 */

import { z } from 'zod';

/**
 * Resultado tipado del parser. Si `ok: false`, el caller puede inspeccionar
 * `errorKind` para decidir si tiene sentido retry o no:
 *   - `json_parse_error` → el modelo devolvió algo que no es JSON. Retry
 *     puede ayudar (modelo podría regenerar bien).
 *   - `schema_mismatch` → JSON válido pero campos no cuadran con contrato.
 *     Retry probablemente ayuda menos: el modelo tiene una idea propia que
 *     mantendrá. Considerar bajar `temperature` o reforzar el prompt.
 *   - `empty_input` → llegó string vacío. Bug upstream, no reintentar.
 */
export type ParseResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      errorKind: 'json_parse_error' | 'schema_mismatch' | 'empty_input';
      message: string;
      /** Primeros 5 issues de Zod si aplica, formateados como string corto. */
      issues?: string[];
      /** Primeros 500 chars del raw — útil para diagnostics, NO loguear en prod sin trimming. */
      rawPreview?: string;
    };

/**
 * Extrae un bloque JSON del texto crudo de un LLM. Tolera:
 *   - Fenced ```json ... ``` (cerrado o sin cerrar)
 *   - Texto antes/después del JSON
 *
 * Si no encuentra fences, devuelve el trim del texto. Si el texto crudo no
 * es JSON, JSON.parse se quejará después — esa responsabilidad NO es de
 * esta función.
 */
export function extractJson(text: string): string {
  // Fenced cerrado: ```json ... ``` o ``` ... ```
  const closed = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (closed?.[1]) return closed[1].trim();
  // Fenced abierto sin cerrar (max_tokens cortó la respuesta): ```json\n{...
  const opener = text.match(/^\s*```(?:json)?\s*\n?/);
  if (opener) return text.slice(opener[0].length).trim();
  return text.trim();
}

/**
 * Parsea y valida un raw output de LLM contra un schema Zod.
 *
 * @param schema Zod schema del output esperado (típicamente de `types.ts`).
 * @param raw    String crudo devuelto por el LLM.
 * @param ctx    Contexto opcional para logs ({ agentName?: string }).
 *
 * @returns ParseResult discriminado por `ok`. NO tira.
 *
 * @example
 *   const result = parseAgentOutput(A1Output, llmRaw, { agentName: 'A1' });
 *   if (!result.ok) {
 *     console.error(result.errorKind, result.message);
 *     return null;
 *   }
 *   return result.data; // ya tipado como A1Output_t
 */
export function parseAgentOutput<T extends z.ZodTypeAny>(
  schema: T,
  raw: string,
  ctx: { agentName?: string } = {}
): ParseResult<z.infer<T>> {
  const agentName = ctx.agentName ?? 'unknown';

  if (!raw || raw.trim().length === 0) {
    return {
      ok: false,
      errorKind: 'empty_input',
      message: `[${agentName}] raw output vacío`,
    };
  }

  const jsonString = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return {
      ok: false,
      errorKind: 'json_parse_error',
      message: `[${agentName}] JSON.parse: ${msg}`,
      rawPreview: raw.slice(0, 500).replace(/\n/g, ' '),
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 5).map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : 'root';
      return `${path}: ${i.message}`;
    });
    return {
      ok: false,
      errorKind: 'schema_mismatch',
      message: `[${agentName}] schema mismatch — ${issues[0] ?? 'unknown'}`,
      issues,
      rawPreview: raw.slice(0, 500).replace(/\n/g, ' '),
    };
  }

  return { ok: true, data: result.data as z.infer<T> };
}

/**
 * Versión "tira si falla" para callers que prefieran exception-style.
 * Internamente delega a parseAgentOutput.
 *
 * @throws AgentParseError con mensaje legible y zodIssues si aplica.
 */
export function parseAgentOutputOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  raw: string,
  ctx: { agentName?: string } = {}
): z.infer<T> {
  const result = parseAgentOutput(schema, raw, ctx);
  if (!result.ok) {
    throw new AgentParseError(
      ctx.agentName ?? 'unknown',
      result.errorKind,
      result.message,
      result.issues,
      result.rawPreview
    );
  }
  return result.data;
}

/**
 * Error tipado para el path "throw style". Mantenemos compatibilidad con el
 * AgentParseError viejo de `lib/anthropic.ts` durante la migración.
 */
export class AgentParseError extends Error {
  constructor(
    public readonly agentName: string,
    public readonly errorKind:
      | 'json_parse_error'
      | 'schema_mismatch'
      | 'empty_input',
    message: string,
    public readonly issues?: string[],
    public readonly rawPreview?: string
  ) {
    super(message);
    this.name = 'AgentParseError';
  }
}
