/**
 * A.D.A.M. — `computeConfluence()` — math determinística de confluence
 *
 * Refactor Fase 1 · Tarea 1.4
 *
 * Extrae del LLM de A4 la matemática de scoring + capping rules. A4
 * narrate solo recibirá el resultado YA calculado y lo usará para
 * construir la narrativa, sin tocar los números.
 *
 * Estructura:
 *   computeConfluence({a1, a2, a3, debate}) →
 *     {a3_solo, a1_a2, alineados, score_total_pct, nivel_final}
 *
 * Pesos canónicos (acuerdo §4 del plan):
 *   - A3 solo:    30% del score total
 *   - A1 + A2:    40% del score total
 *   - Alineados:  30% del score total
 *
 * Capping rules por agentes vivos (defensa contra "confluencia alta con
 * datos parciales"):
 *   - 3 vivos → sin cap (puede llegar a alta)
 *   - 2 vivos → cap a 66 (máx "media")
 *   - 1 vivo  → cap a 33 (máx "baja")
 *   - 0 vivos → 0
 *
 * Niveles:
 *   ≥ 67 → alta
 *   ≥ 34 → media
 *   <  34 → baja
 */

import type { z } from 'zod';
import type {
  A1Output_t,
  A2Output_t,
  A3Output_t,
  Confidence_t,
  ConfluenceResult,
} from '@/agents/shared/types';

/**
 * Subset del DebateOutput que necesita el cálculo de confluence.
 * Mantener el tipo "wide" permite que el caller pase el output completo
 * o un mock minimalista — flexibilidad para tests + integración futura.
 */
export interface DebateForConfluence {
  convergence_score: number; // 0-100
  direccion: 'alcista' | 'bajista' | 'neutral';
}

export interface ComputeConfluenceInput {
  a1: A1Output_t | null;
  a2: A2Output_t | null;
  a3: A3Output_t | null;
  debate: DebateForConfluence | null;
}

// ─── Pesos y caps — constantes exportadas para tests ────────────────────────

export const WEIGHT_A3_SOLO = 0.3;
export const WEIGHT_A1_A2 = 0.4;
export const WEIGHT_ALIGN = 0.3;

/**
 * Cap del total según número de agentes vivos. Implementa la regla
 * "confluencia alta requiere los 3 ángulos" del plan §4 + A4 prompt §8.
 *
 * Index = aliveCount, value = cap máximo del score total.
 */
export const ALIVE_CAPS = [0, 33, 66, 100] as const;

// ───────────────────────────────────────────────────────────────────────────
// Score por nivel — funciones puras exportadas para tests independientes
// ───────────────────────────────────────────────────────────────────────────

/**
 * A3 solo. Decisión §1 acordada: usar `a3.confidence` directamente (0-100).
 * Si A3 caído → 0.
 */
export function scoreA3Solo(a3: A3Output_t | null): number {
  if (!a3) return 0;
  return clamp0to100(a3.confidence);
}

/**
 * A1 + A2.
 *
 * Tres escenarios:
 *   1. Con debate Y a1+a2 vivos: convergence × combined confidence.
 *      Esta es la señal "validada" — el debate confirmó (o invalidó) la
 *      convergencia de los dos análisis individuales.
 *   2. Sin debate pero a1+a2 vivos: avg(confidences) × directionalAgreement,
 *      penalizado a 50% porque NO hubo validación cruzada formal.
 *      "directionalAgreement" = ambos detectan algo o ambos no detectan nada.
 *   3. Solo uno vivo (a1 XOR a2): la confianza del único, penalizada a 33%
 *      porque media de "uno solo" no es validación cruzada en absoluto.
 *
 * Cualquier otro caso (ambos null): 0.
 */
export function scoreA1A2(
  a1: A1Output_t | null,
  a2: A2Output_t | null,
  debate: DebateForConfluence | null
): number {
  // Caso 1: con debate Y ambos vivos
  if (debate && a1 && a2) {
    const conv = debate.convergence_score; // 0-100
    const combined = (a1.confidence + a2.confidence) / 2; // 0-100
    return Math.round((conv * combined) / 100);
  }

  // Caso 2: sin debate, ambos vivos
  if (a1 && a2) {
    const avg = (a1.confidence + a2.confidence) / 2;
    // Directional agreement: ambos coinciden en si detectan algo o no.
    // No es perfecto (A1 detecta vulnerabilidad mientras A2 detecta oportunidad
    // es agreement booleano pero contradicción direccional), pero combinado
    // con scoreAlignment compensa.
    const a1HasSignal = a1.anomaly_detected;
    const a2HasSignal = a2.opportunity_detected;
    const agreement = a1HasSignal === a2HasSignal ? 1.0 : 0.6;
    return Math.round(avg * agreement * 0.5);
  }

  // Caso 3: solo uno vivo
  const solo = a1 ?? a2;
  if (solo) {
    return Math.round(solo.confidence * 0.33);
  }

  return 0;
}

/**
 * Alignment — qué fracción de los agentes vivos apuntan en la MISMA dirección.
 *
 * Algoritmo gradual (decisión §3 acordada: "lo que pueda ser más preciso"):
 *
 *   1. Derivar dirección de cada agente:
 *      - a1: anomaly_type 'oportunidad' → alcista
 *            anomaly_type 'vulnerabilidad' → bajista
 *            'anomalia' o null → neutral
 *      - a2: opportunity_detected → alcista, !opportunity_detected → neutral
 *      - a3: signal buy → alcista, sell → bajista, hold → neutral
 *
 *   2. Filtrar direcciones neutrales/null (no aportan a alignment).
 *
 *   3. Scoring gradual:
 *      - 3 agentes opinan, los 3 al mismo lado → 100
 *      - 3 opinan, 2 al mismo lado → 30 (split, ruido)
 *      - 2 opinan, los 2 al mismo lado → 70
 *      - 2 opinan, discrepan → 0
 *      - 1 opina → 30 (no es alignment, es opinión solitaria)
 *      - 0 opinan → 0
 */
export function scoreAlignment(
  a1: A1Output_t | null,
  a2: A2Output_t | null,
  a3: A3Output_t | null
): number {
  const directions = [directionOfA1(a1), directionOfA2(a2), directionOfA3(a3)]
    .filter((d): d is 'alcista' | 'bajista' => d === 'alcista' || d === 'bajista');

  const total = directions.length;
  if (total === 0) return 0;

  const alcistas = directions.filter((d) => d === 'alcista').length;
  const bajistas = directions.filter((d) => d === 'bajista').length;
  const dominant = Math.max(alcistas, bajistas);

  // 3 agentes con dirección, todos coinciden → alineación plena
  if (total === 3 && dominant === 3) return 100;
  // 3 con dirección, split 2-1 → mucho ruido
  if (total === 3 && dominant === 2) return 30;
  // 2 con dirección, ambos al mismo lado → alta pero no plena (falta el 3º)
  if (total === 2 && dominant === 2) return 70;
  // 2 con dirección, discrepan → cero
  if (total === 2 && dominant === 1) return 0;
  // 1 solo opinando → no es alineación
  if (total === 1) return 30;

  return 0;
}

// ───────────────────────────────────────────────────────────────────────────
// Direction helpers — privados
// ───────────────────────────────────────────────────────────────────────────

function directionOfA1(a1: A1Output_t | null): 'alcista' | 'bajista' | 'neutral' | null {
  if (!a1) return null;
  if (a1.anomaly_type === 'oportunidad') return 'alcista';
  if (a1.anomaly_type === 'vulnerabilidad') return 'bajista';
  // 'anomalia' es ambigua por diseño (puede ser positiva o negativa);
  // si A1 quiere expresarlo, lo hace via vulnerabilidad/oportunidad.
  return 'neutral';
}

function directionOfA2(a2: A2Output_t | null): 'alcista' | 'bajista' | 'neutral' | null {
  if (!a2) return null;
  // Lectura prioritaria del nuevo campo `regime_outlook` (cuando el LLM
  // empieza a emitirlo). Permite a A2 expresar régimen bajista — antes
  // imposible por diseño, creando asimetría: ADAM no podía alinear los 3
  // agentes en dirección bajista. Ver agents/shared/types.ts:A2Output.
  if (a2.regime_outlook === 'risk_on') return 'alcista';
  if (a2.regime_outlook === 'risk_off') return 'bajista';
  if (a2.regime_outlook === 'neutral') return 'neutral';
  // Fallback back-compat: si el LLM no emite regime_outlook (runs viejos,
  // schema legacy), seguimos derivando de opportunity_detected. Ausencia
  // de oportunidad sigue siendo neutral aquí — la asimetría solo se rompe
  // cuando el LLM aprende a emitir regime_outlook explícitamente.
  if (a2.opportunity_detected) return 'alcista';
  return 'neutral';
}

function directionOfA3(a3: A3Output_t | null): 'alcista' | 'bajista' | 'neutral' | null {
  if (!a3) return null;
  if (a3.operativa.signal === 'buy') return 'alcista';
  if (a3.operativa.signal === 'sell') return 'bajista';
  return 'neutral';
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers genéricos
// ───────────────────────────────────────────────────────────────────────────

function clamp0to100(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

/**
 * Clasifica un score 0-100 en nivel categórico.
 * Thresholds: ≥67 alta, ≥34 media, <34 baja (heredados del UI existente).
 */
export function levelFromScore(score: number): Confidence_t {
  if (score >= 67) return 'alta';
  if (score >= 34) return 'media';
  return 'baja';
}

// ───────────────────────────────────────────────────────────────────────────
// Orquestador
// ───────────────────────────────────────────────────────────────────────────

export function computeConfluence(
  input: ComputeConfluenceInput
): z.infer<typeof ConfluenceResult> {
  const { a1, a2, a3, debate } = input;

  const a3Score = scoreA3Solo(a3);
  const a12Score = scoreA1A2(a1, a2, debate);
  const alignScore = scoreAlignment(a1, a2, a3);

  // Score total ponderado
  let total =
    a3Score * WEIGHT_A3_SOLO + a12Score * WEIGHT_A1_A2 + alignScore * WEIGHT_ALIGN;

  // Capping por agentes vivos
  const aliveCount = [a1, a2, a3].filter((x) => x !== null).length;
  const cap = ALIVE_CAPS[aliveCount] ?? 100;
  total = Math.min(total, cap);

  // Redondeo final entero
  const score_total_pct = Math.max(0, Math.min(100, Math.round(total)));

  return {
    // a3_solo.nivel está fijado a 'baja' por invariante de diseño en
    // ConfluenceResult (agents/shared/types.ts:416): "A3 sola NUNCA llega a
    // 'alta' por diseño — una sola pata técnica no constituye confluencia".
    // El `score` SÍ refleja la confianza de A3 (puede ser 80, 90...), pero
    // la categoría agregada para el aspecto "A3 solo" se queda en baja.
    a3_solo: { score: a3Score, nivel: 'baja' as const },
    a1_a2: { score: a12Score, nivel: levelFromScore(a12Score) },
    alineados: { score: alignScore, nivel: levelFromScore(alignScore) },
    score_total_pct,
    nivel_final: levelFromScore(score_total_pct),
  };
}
