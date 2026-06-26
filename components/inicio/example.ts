/**
 * Ejemplo ILUSTRATIVO de la landing /inicio — TRES escenarios.
 *
 * ⚠️ NO son datos reales. Cifras de muestra para enseñar el FORMATO de salida
 * de A.D.A.M. y su modelo de calibración. La UI debe mostrar SIEMPRE la etiqueta
 * "ejemplo ilustrativo · no es una recomendación".
 *
 * Los nombres de campo espejan la salida real (agents/shared/types.ts:
 * A1Output / A2Output / A3Output / A4Output) y respetan los umbrales de
 * confluencia (0–33 baja · 34–66 media · 67–100 alta).
 *
 * Los tres casos demuestran que la confianza accionable depende de DOS ejes
 * (accionable = |net| · f(κ)):
 *   1. "coinciden"   → acuerdo alto + convicción alta  → confianza ALTA.
 *   2. "discrepan"   → las lecturas chocan, κ baja      → confianza BAJA.
 *   3. "senal-debil" → coinciden pero con poca fuerza   → confianza CONTENIDA.
 *
 * FORMATO: los valores numéricos se guardan como NÚMEROS. La UI los formatea a
 * es-ES (coma decimal, signo, %). No formatear aquí.
 *   · price.current        → toLocaleString('es-ES', { minimumFractionDigits: 2 })
 *   · price.change_pct_24h → signo + flecha (▲/▼) + es-ES + '%'; el COLOR (up/down)
 *                            se deriva del signo (es dato de mercado).
 *   · verdict.kappa        → 2 decimales es-ES (0.9 → "0,90").
 *
 * FIREWALL SEMÁNTICO: el color del veredicto se deriva de `direccion` vía
 * VERDICT_TONE (abajo). 'up'/'down'/'warn' === tokens de MERCADO
 * (emerald/rose/amber) y SOLO pueden usarse para datos de mercado.
 * Jamás en chrome, navegación, CTAs o estados de UI.
 */

export type AgentTag = 'A1' | 'A2' | 'A3';
export type Direccion = 'POSITIVO' | 'NEGATIVO' | 'NEUTRAL';
export type Nivel = 'alta' | 'media' | 'baja';

export interface ExampleLens {
  tag: AgentTag;
  /** Etiqueta legible del agente (Fundamental / Macro / Técnico). */
  label: string;
  /** Confianza 0-100 del agente. */
  confidence: number;
  /** Datos concretos que muestra la tarjeta. */
  points: { k: string; v: string }[];
  /** Lectura en una línea (voz ATLAS CAPITAL: directa, cuantificada). */
  line: string;
  /** A3 es el único aislado (solo OHLCV). */
  isolated?: boolean;
}

export interface ExampleVerdict {
  direccion: Direccion;
  /** Texto a mostrar si difiere del enum (p. ej. "Positivo leve"). Si falta,
   *  la UI capitaliza `direccion`. */
  direccion_label?: string;
  /** Eje principal del titular: confianza accionable = |net|·f(κ), 0-100. */
  actionable_pct: number;
  /** κ — coherencia entre agentes (0-1). */
  kappa: number;
  confluence_pct: number;
  nivel: Nivel;
  confianza: Nivel;
  porque: string;
  accion: string;
  riesgo: string;
}

export interface Scenario {
  /** Id estable (clave de React / analítica). */
  id: 'coinciden' | 'discrepan' | 'senal-debil';
  /** Etiqueta de la pestaña. */
  tabLabel: string;
  /** Frase guía bajo las pestañas. */
  hint: string;
  ticker: string;
  price: { current: number; change_pct_24h: number; currency: string };
  lenses: ExampleLens[];
  verdict: ExampleVerdict;
}

/** @deprecated Conservado por compat con imports antiguos. Usa `Scenario`. */
export type Example = Scenario;

/**
 * Única fuente del tono semántico del veredicto a partir de su dirección.
 * Úsalo para el color del gauge y de la etiqueta de dirección — NUNCA
 * introduzcas emerald/rose/amber fuera de datos de mercado (firewall).
 */
export const VERDICT_TONE: Record<Direccion, 'up' | 'down' | 'warn'> = {
  POSITIVO: 'up',
  NEGATIVO: 'down',
  NEUTRAL: 'warn',
};

export const SCENARIOS: Scenario[] = [
  // ── 1 · COINCIDEN ──────────────────────────────────────────────────────────
  {
    id: 'coinciden',
    tabLabel: 'Coinciden',
    hint: 'Las tres lecturas coinciden → confianza alta.',
    ticker: 'AAPL',
    price: { current: 212, change_pct_24h: 1.8, currency: 'USD' },
    lenses: [
      {
        tag: 'A1', label: 'Fundamental', confidence: 78,
        points: [{ k: 'PER', v: '29' }, { k: 'EV/EBITDA', v: '22' }, { k: 'FCF yield', v: '3,4%' }],
        line: 'Caja sólida y catalizador de servicios; el mercado infravalora el ciclo de recompras.',
      },
      {
        tag: 'A2', label: 'Macro', confidence: 72,
        points: [{ k: 'Ciclo', v: 'Expansión' }, { k: 'Tipos', v: 'A la baja' }, { k: 'Inflación', v: 'Cediendo' }],
        line: 'Tipos a la baja e inflación cediendo: viento de cola claro para tech de calidad.',
      },
      {
        tag: 'A3', label: 'Técnico', confidence: 74, isolated: true,
        points: [{ k: 'Tendencia', v: 'Alcista 5/5' }, { k: 'Entrada', v: '212' }, { k: 'Stop', v: '203' }, { k: 'Objetivo', v: '234' }, { k: 'R/B', v: '2,4:1' }],
        line: 'Alcista sobre todas las medias, golden cross reciente. Compra a mercado con objetivo 234.',
      },
    ],
    verdict: {
      direccion: 'POSITIVO',
      actionable_pct: 71, kappa: 0.9, confluence_pct: 78, nivel: 'alta', confianza: 'alta',
      porque: 'Las tres lecturas coinciden al alza y se confirman entre sí, así que la conclusión es positiva y con una confianza alta.',
      accion: 'Convicción alta y niveles claros: la entrada estaría cerca de 212, y la idea se cancelaría si el precio pierde los 203.',
      riesgo: 'Si pierde los 203 con mucho volumen, la tesis se rompe; y al estar cara, le afecta más cualquier susto en la economía.',
    },
  },

  // ── 2 · DISCREPAN ──────────────────────────────────────────────────────────
  {
    id: 'discrepan',
    tabLabel: 'Discrepan',
    hint: 'Las lecturas chocan → κ baja, confianza baja.',
    ticker: 'TSLA',
    price: { current: 248.3, change_pct_24h: -0.6, currency: 'USD' },
    lenses: [
      {
        tag: 'A1', label: 'Fundamental', confidence: 66,
        points: [{ k: 'PER', v: '71' }, { k: 'Margen', v: 'Estrecho' }, { k: 'Crecim.', v: 'Desacelera' }],
        line: 'Crecimiento caro: múltiplos muy exigentes para el flujo de caja actual.',
      },
      {
        tag: 'A2', label: 'Macro', confidence: 70,
        points: [{ k: 'Ciclo', v: 'Tardío' }, { k: 'Tipos', v: 'Altos' }, { k: 'Duración', v: 'Penalizada' }],
        line: 'Tipos altos castigan a las compañías de larga duración como esta.',
      },
      {
        tag: 'A3', label: 'Técnico', confidence: 52, isolated: true,
        points: [{ k: 'Tendencia', v: 'Lateral' }, { k: 'Soporte', v: '232' }, { k: 'Resist.', v: '262' }, { k: 'Sesgo', v: 'Ninguno' }],
        line: 'Atrapada entre soporte y resistencia; sin tendencia definida.',
      },
    ],
    verdict: {
      direccion: 'NEUTRAL',
      actionable_pct: 24, kappa: 0.31, confluence_pct: 38, nivel: 'baja', confianza: 'baja',
      porque: 'Las lecturas apuntan en direcciones distintas. Sin acuerdo entre los agentes, la confianza es baja.',
      accion: 'Sin convicción ni nivel claro: A.D.A.M. recomienda esperar confirmación, no forzar la entrada.',
      riesgo: 'Una sola lectura aislada puede engañar; aquí el propio desacuerdo es la señal.',
    },
  },

  // ── 3 · SEÑAL DÉBIL ────────────────────────────────────────────────────────
  {
    id: 'senal-debil',
    tabLabel: 'Señal débil',
    hint: 'Coinciden, pero con poca convicción → confianza contenida.',
    ticker: 'KO',
    price: { current: 62.4, change_pct_24h: 0.2, currency: 'USD' },
    lenses: [
      {
        tag: 'A1', label: 'Fundamental', confidence: 52,
        points: [{ k: 'PER', v: '24' }, { k: 'Crecim.', v: 'Plano' }, { k: 'Dividendo', v: 'Sólido' }],
        line: 'Valoración justa y negocio estable, pero sin catalizador a la vista.',
      },
      {
        tag: 'A2', label: 'Macro', confidence: 50,
        points: [{ k: 'Ciclo', v: 'Neutral' }, { k: 'Perfil', v: 'Defensivo' }, { k: 'Viento', v: 'Ninguno' }],
        line: 'Defensiva: ni el ciclo la impulsa ni la frena con claridad.',
      },
      {
        tag: 'A3', label: 'Técnico', confidence: 54, isolated: true,
        points: [{ k: 'Tendencia', v: 'Suave +' }, { k: 'Soporte', v: '60' }, { k: 'Objetivo', v: '65' }, { k: 'R/B', v: '1,3:1' }],
        line: 'Tendencia suave al alza, con poca fuerza compradora detrás.',
      },
    ],
    verdict: {
      direccion: 'POSITIVO',
      direccion_label: 'Positivo leve',
      actionable_pct: 34, kappa: 0.68, confluence_pct: 52, nivel: 'baja', confianza: 'baja',
      porque: 'Coinciden en dirección, pero con poca convicción: la señal es suave y la confianza, contenida.',
      accion: 'Dirección al alza pero floja: tamaño reducido o esperar más fuerza antes de actuar.',
      riesgo: 'Con tan poca convicción, cualquier ruido la mueve; es una tesis fácil de invalidar.',
    },
  },
];

/** Compat: escenario por defecto (lo que antes exportaba `EXAMPLE`). */
export const EXAMPLE: Scenario = SCENARIOS[0]!;
