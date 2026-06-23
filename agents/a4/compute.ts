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
import type { EstructuraOutput_t } from '@/agents/estructura/schema';

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
  /**
   * Agente de Estructura (futuros · MTF). OPCIONAL y opt-in del usuario: cuando
   * se pasa, computeConfluence cambia a la matemática de 4 patas (pesos + caps
   * de 4) y su dirección entra en el alignment. Cuando es null/ausente, la ruta
   * de 3 agentes es byte-idéntica a la histórica (cero regresión).
   */
  estructura?: EstructuraOutput_t | null;
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

// ─── Ruta de 4 patas — Estructura (futuros · MTF) opt-in ────────────────────

/**
 * Pesos cuando el Agente de Estructura está activo. Confirmados por el owner
 * (2026-06-23): price-action dominante — el bloque técnico A3+EST=.45 manda
 * sobre el fundamental A1A2=.30; tiene sentido para futuros. Suman 1.0.
 */
export const WEIGHT4_A1_A2 = 0.3;
export const WEIGHT4_A3_SOLO = 0.25;
export const WEIGHT4_ESTRUCTURA = 0.2;
export const WEIGHT4_ALIGN = 0.25;

/**
 * Caps por agentes vivos en la ruta de 4. Index = aliveCount de
 * {a1, a2, a3, estructura}. EST siempre está vivo en esta ruta (solo se entra
 * cuando estructura !== null), así que aliveCount ∈ [1, 4].
 */
export const ALIVE_CAPS_4 = [0, 25, 50, 75, 100] as const;

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
 *      - a3: signal buy → alcista, sell → bajista; hold → cae a tendencia.primaria
 *            (alcista/bajista; lateral → neutral) para no perder el sesgo de fondo
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
  return alignmentScore([directionOfA1(a1), directionOfA2(a2), directionOfA3(a3)]);
}

/**
 * Variante de 4 patas: añade la dirección del Agente de Estructura como un voto
 * co-igual. Reusa la MISMA tabla gradual (`alignmentScore`), extendida al caso
 * de 4 votos. EST 'compra'→alcista, 'venta'→bajista, 'ninguno'→cae al Daily.
 */
export function scoreAlignment4(
  a1: A1Output_t | null,
  a2: A2Output_t | null,
  a3: A3Output_t | null,
  estructura: EstructuraOutput_t | null
): number {
  return alignmentScore([
    directionOfA1(a1),
    directionOfA2(a2),
    directionOfA3(a3),
    directionOfEstructura(estructura),
  ]);
}

/**
 * Tabla gradual de alignment sobre el conjunto de direcciones NO neutrales.
 * Reproduce EXACTAMENTE la tabla histórica de 3 agentes y la extiende a 4:
 *
 *   0 votos → 0 · 1 voto → 30
 *   unánimes: 2 votos → 70 · 3+ votos → 100
 *   con disenso: 1-1 → 0 · 2-1 → 30 · 3-1 → 60 · 2-2 → 0
 *
 * (Máx 4 agentes en ADAM, así que `total` nunca pasa de 4.)
 */
function alignmentScore(
  raw: Array<'alcista' | 'bajista' | 'neutral' | null>
): number {
  const directions = raw.filter(
    (d): d is 'alcista' | 'bajista' => d === 'alcista' || d === 'bajista'
  );
  const total = directions.length;
  if (total === 0) return 0;
  if (total === 1) return 30;

  const alcistas = directions.filter((d) => d === 'alcista').length;
  const dominant = Math.max(alcistas, total - alcistas);
  const minority = total - dominant;

  if (minority === 0) return total === 2 ? 70 : 100; // unanimidad
  if (total === 2) return 0; // 1-1
  if (total === 3) return 30; // 2-1
  return dominant === 3 ? 60 : 0; // 4 votos: 3-1 → 60, 2-2 → 0
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
  // HOLD = sin setup accionable, pero A3 puede tener un sesgo de fondo. Antes
  // un HOLD contaba como neutral y la tendencia se perdía (un HOLD en tendencia
  // alcista no es "sin opinión"). Caemos a la tendencia primaria para que la
  // lectura direccional de A3 SÍ cuente en la alineación. 'lateral' → neutral.
  if (a3.tendencia.primaria === 'alcista') return 'alcista';
  if (a3.tendencia.primaria === 'bajista') return 'bajista';
  return 'neutral';
}

function directionOfEstructura(
  est: EstructuraOutput_t | null
): 'alcista' | 'bajista' | 'neutral' | null {
  if (!est) return null;
  if (est.setup.direccion === 'compra') return 'alcista';
  if (est.setup.direccion === 'venta') return 'bajista';
  // setup 'ninguno' (esperando zona, sin gatillo…): no perdemos el sesgo de
  // fondo — caemos a la dirección estructural del Daily, igual que A3 hold cae
  // a tendencia.primaria. 'lateral' → neutral.
  if (est.contexto.daily.direccion === 'alcista') return 'alcista';
  if (est.contexto.daily.direccion === 'bajista') return 'bajista';
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
  const { a1, a2, a3, debate, estructura = null } = input;

  const a3Score = scoreA3Solo(a3);
  const a12Score = scoreA1A2(a1, a2, debate);

  // ── Ruta de 4 patas: Estructura opt-in activo ────────────────────────────
  if (estructura !== null) {
    const estScore = clamp0to100(estructura.confianza);
    const alignScore4 = scoreAlignment4(a1, a2, a3, estructura);

    let total4 =
      a12Score * WEIGHT4_A1_A2 +
      a3Score * WEIGHT4_A3_SOLO +
      estScore * WEIGHT4_ESTRUCTURA +
      alignScore4 * WEIGHT4_ALIGN;

    // EST siempre vivo aquí → aliveCount ∈ [1, 4].
    const aliveCount4 = [a1, a2, a3, estructura].filter((x) => x !== null).length;
    const cap4 = ALIVE_CAPS_4[aliveCount4] ?? 100;
    total4 = Math.min(total4, cap4);

    const score_total_pct4 = Math.max(0, Math.min(100, Math.round(total4)));

    return {
      a3_solo: { score: a3Score, nivel: 'baja' as const },
      a1_a2: { score: a12Score, nivel: levelFromScore(a12Score) },
      alineados: { score: alignScore4, nivel: levelFromScore(alignScore4) },
      // EST_solo SÍ expone su nivel real (no fijado a 'baja' como a3_solo): es
      // una lente opt-in que el usuario añade a propósito; mostrar su convicción
      // estructural honesta es lo informativo. El agregado sigue cappeado.
      estructura: { score: estScore, nivel: levelFromScore(estScore) },
      score_total_pct: score_total_pct4,
      nivel_final: levelFromScore(score_total_pct4),
    };
  }

  // ── Ruta legacy de 3 agentes — byte-idéntica a la histórica ──────────────
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
