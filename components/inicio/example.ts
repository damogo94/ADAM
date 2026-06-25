/**
 * Ejemplo ILUSTRATIVO para la landing /inicio.
 *
 * ⚠️ NO son datos reales: cifras de muestra para enseñar el FORMATO de salida
 * de A.D.A.M. Se renderiza siempre con la etiqueta "ejemplo ilustrativo · no es
 * una recomendación". Los nombres de campo espejan la salida real
 * (agents/shared/types.ts: A1Output/A2Output/A3Output/A4Output) y respetan los
 * umbrales de confluencia (0-33 baja · 34-66 media · 67-100 alta).
 *
 * Caso: tres lecturas alineadas al alza con convicción alta → veredicto positivo
 * con confianza accionable alta (κ coherencia alta).
 */

export interface ExampleLens {
  tag: 'A1' | 'A2' | 'A3';
  label: string;
  /** Confianza 0-100 del agente. */
  confidence: number;
  /** Lectura en una línea (voz ATLAS CAPITAL: directa, cuantificada). */
  line: string;
  /** Datos concretos que muestra la tarjeta. */
  points: { k: string; v: string }[];
  /** A3 es el único aislado (solo OHLCV). */
  isolated?: boolean;
}

export interface Example {
  ticker: string;
  price: { current: number; change_pct_24h: number; currency: string };
  lenses: ExampleLens[];
  verdict: {
    direccion: 'POSITIVO' | 'NEGATIVO' | 'NEUTRAL';
    /** Eje principal del titular: confianza accionable = |net|·f(κ), 0-100. */
    actionable_pct: number;
    /** κ — coherencia entre agentes (0-1). */
    kappa: number;
    confluence_pct: number;
    nivel: 'alta' | 'media' | 'baja';
    confianza: 'alta' | 'media' | 'baja';
    porque: string;
    accion: string;
    riesgo: string;
  };
}

export const EXAMPLE: Example = {
  ticker: 'AAPL',
  price: { current: 212, change_pct_24h: 1.8, currency: 'USD' },
  lenses: [
    {
      tag: 'A1',
      label: 'Fundamental',
      confidence: 78,
      line: 'Caja sólida y catalizador de servicios; el mercado infravalora el ciclo de recompras.',
      points: [
        { k: 'PER', v: '29' },
        { k: 'EV/EBITDA', v: '22' },
        { k: 'FCF yield', v: '3,4%' },
      ],
    },
    {
      tag: 'A2',
      label: 'Macro',
      confidence: 72,
      line: 'Tipos a la baja e inflación cediendo: viento de cola claro para tech de calidad.',
      points: [
        { k: 'Ciclo', v: 'Expansión' },
        { k: 'Tipos', v: 'A la baja' },
        { k: 'Inflación', v: 'Cediendo' },
      ],
    },
    {
      tag: 'A3',
      label: 'Técnico',
      confidence: 74,
      isolated: true,
      line: 'Alcista sobre todas las medias, golden cross reciente. Compra a mercado con objetivo 234.',
      points: [
        { k: 'Tendencia', v: 'Alcista 5/5' },
        { k: 'Entrada', v: '212' },
        { k: 'Stop', v: '203' },
        { k: 'Objetivo', v: '234' },
        { k: 'R/B', v: '2,4:1' },
      ],
    },
  ],
  verdict: {
    direccion: 'POSITIVO',
    actionable_pct: 71,
    kappa: 0.9,
    confluence_pct: 78,
    nivel: 'alta',
    confianza: 'alta',
    porque:
      'Las tres lecturas apuntan arriba y se confirman entre sí (κ alta) → veredicto positivo con confianza accionable alta.',
    accion:
      'Convicción alta y niveles definidos: entrada cerca de 212, invalidación por debajo de 203.',
    riesgo:
      'Perder 203 con volumen rompe la tesis; la valoración exigente amplifica cualquier susto macro.',
  },
};
