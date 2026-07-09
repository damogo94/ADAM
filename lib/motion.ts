/**
 * Motion config para la vitalidad de /analysis (Fase 1 · rediseño hero-led).
 *
 * LÍNEAS ROJAS del rediseño (ver ADAM_ANALYSIS_VITALIDAD_FASE0 / "Design system
 * invariants" en CLAUDE.md). Todo lo que consuma este módulo debe respetarlas:
 * - UN SOLO lenguaje de motion: lo nuevo reutiliza la curva maestra EASE_PRECISE
 *   (clon exacto del token `ease-precise` de tailwind.config.ts). Prohibido un 2º
 *   dialecto de easing/duración.
 * - Firewall cromático: el chrome de vitalidad usa SOLO accent/ink; nunca
 *   emerald/rose/amber (esos = dato de mercado resuelto). Única excepción sancionada
 *   = la aurora del glow del núcleo ya existente, al resolver.
 * - Honesty invariant: movimiento indeterminado ≠ progreso; la magnitud por-agente
 *   es modesta (marca "este llegó", no implica pacing global).
 * - Duraciones CONFIGURABLES sobre las ESTIMACIONES estáticas de D1. Se RECALIBRAN
 *   con la captura real (lib/run/timing.ts) antes de fijarse. NO son medición.
 */

/** Curva maestra del sistema — clon exacto del token `ease-precise` (tailwind.config.ts:96). */
export const EASE_PRECISE = [0.22, 0.61, 0.36, 1] as const;

/** La misma curva en forma CSS, para transiciones/keyframes fuera de framer. */
export const EASE_PRECISE_CSS = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/**
 * Modelo temporal ESTIMADO de un run (D1) — reconstruido del código, NO medido.
 * Referencia para lógica dead-air-aware; NO usar como duración de animación hasta
 * confirmarlo con lib/run/timing.ts. Valores en ms, régimen cache-fría (el "demo").
 */
export const RUN_TIMING_ESTIMATE = {
  /** Fan-out de datos invisible, previo al primer evento NDJSON. */
  dataFanoutMs: 6_000,
  /** Vuelo paralelo A1/A3: NADA aterriza (el hueco a diseñar honestamente). */
  deadAirMs: 12_000,
  /** A1+A3+debate aterrizan agrupados casi-simultáneos (la ráfaga). */
  burstAtMs: 18_000,
  /** A4/`final` resuelve el hero (el pago real). */
  resolveAtMs: 24_000,
  /** A2 tardío (Sonnet, lambda aparte) — solo en cache fría, tras el resolve. */
  a2ColdLateAtMs: 30_000,
} as const;

/**
 * Duraciones de las vitalidades nuevas (hero-led). Ecoan el ritmo YA existente
 * (D5): settle de card 300ms, pop de resolución 520ms. No se inventan tempos.
 */
export const VITALITY = {
  /** Light-up modesto por-agente al aterrizar (D4: "este llegó", sin pacing). */
  agentLandingMs: 260,
  /** Settle del chrome scanning→done (== 300ms de borde ya en agent-card-shell). */
  cardSettleMs: 300,
  /** Crescendo de resolución run-completo (== pop de 520ms ya en orbital-hero). */
  resolveCrescendoMs: 520,
  /** Transición del hero al fijarse persistente (H6), sin salto brusco. */
  heroPinMs: 300,
} as const;
