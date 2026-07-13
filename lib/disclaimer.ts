/**
 * DISCLAIMER_LITERAL — string EXACTO del disclaimer regulatorio, en un módulo HOJA
 * sin dependencias (no arrastra zod). SSOT único:
 *   - `agents/shared/types.ts` lo re-exporta y lo usa en `z.literal(...)` (schema
 *     A4/Estructura) + los agentes (a4/estructura narrate/compute).
 *   - las páginas cliente lo importan de AQUÍ para pintarlo al pie sin meter zod
 *     en su bundle (por eso vivía hardcodeado en ~8 sitios antes de este módulo).
 *
 * Cualquier variación falla contra el schema (z.literal) — deliberado, para que el
 * LLM no se invente disclaimers light. El separador del medio es U+00B7 (·), NO un
 * punto normal. Guardado por `agents/shared/__tests__/types.test.ts` (charCodeAt(19)).
 */
export const DISCLAIMER_LITERAL =
  'Análisis educativo · no constituye asesoramiento financiero regulado';
