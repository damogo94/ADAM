/**
 * A.D.A.M. — Estilo "ATLAS CAPITAL" compartido entre agentes
 *
 * Refactor Fase 1 · Tarea 1.2
 *
 * Fuente de verdad ÚNICA del tono y reglas de estilo que comparten todos los
 * agentes con output narrado para el usuario (A1, A2, A3, A4, Debate, CMT).
 *
 * Antes vivía duplicado e inconsistente en cada prompt: A4 lo definía en §10,
 * el resto solo lo referenciaba "lenguaje ATLAS CAPITAL" sin explicar qué era.
 * Eso causaba que A1/A2/A3 emitieran tonos distintos entre sí y A4 tuviera que
 * normalizar al consolidar.
 *
 * Importar e interpolar en cada `*_SYSTEM_PROMPT`:
 *
 * @example
 *   import { ATLAS_CAPITAL_STYLE } from '@/agents/shared/atlas-capital-style';
 *   export const A1_SYSTEM_PROMPT = `Eres A1...
 *
 *   ${ATLAS_CAPITAL_STYLE}
 *
 *   ## RESTRICCIONES...
 *   `;
 */

export const ATLAS_CAPITAL_STYLE = `# LENGUAJE ATLAS CAPITAL

- **Directo, sin relleno.** "El activo presenta…" → "AAPL presenta…"
- **Cuantifica.** "Riesgo significativo" → "Riesgo de -8% si pierde 175"
- **Tiempo presente y futuro cercano.** No "podría llegar a" → "el escenario base apunta a"
- **Sin jerga vacía.** Nada de "robusto crecimiento", "interesante oportunidad", "claros vientos de cola"
- **Frases cortas.** Máximo 25 palabras por frase. Punto y aparte.`.trim();
