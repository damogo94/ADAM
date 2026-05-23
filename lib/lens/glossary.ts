/**
 * Glosario para la Lente Educativa.
 *
 * Cada entrada tiene un término técnico (key) → explicación simplificada.
 * La key es el slug que pasamos al componente <Glossed>; el `label` es
 * lo que se renderiza en el chip si el contenido envuelto es distinto
 * al término canónico.
 *
 * REGLA: la lente jamás cambia números ni dictámenes; solo expande
 * el lenguaje técnico cuando el usuario activa el modo educativo.
 */

export interface GlossaryEntry {
  /** Etiqueta visible (capitalizada para tooltip). */
  label: string;
  /** Explicación corta — 1-2 frases máx. */
  explanation: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  confluencia: {
    label: 'Confluencia',
    explanation:
      'Porcentaje 0-100 que mide cuánto se alinean los 3 agentes (A1 fundamentales, A2 macro, A3 técnico). Más alto = más señales apuntando al mismo sitio.',
  },
  dictamen: {
    label: 'Dictamen',
    explanation:
      'Veredicto del agente A4 sobre el activo: dirección (positivo/negativo/neutral) + nivel de confianza, ensamblando lo que dijeron A1, A2 y A3.',
  },
  anomalia: {
    label: 'Anomalía',
    explanation:
      'A1 detectó algo fuera de lo normal en los fundamentales o noticias: una oportunidad (▲), una vulnerabilidad (▼) o un patrón raro (◆) que merece mirar.',
  },
  oportunidad: {
    label: 'Oportunidad',
    explanation:
      'A1 ve un setup favorable: ratios atractivos, noticias positivas, momentum, sentimiento alineado. NO es recomendación de compra — solo una señal.',
  },
  vulnerabilidad: {
    label: 'Vulnerabilidad',
    explanation:
      'A1 ve riesgo concreto: deterioro de fundamentales, malas noticias, ratios caros, divergencias. NO es recomendación de venta — solo una alerta.',
  },
  flip: {
    label: 'FLIP',
    explanation:
      'Cambio de dirección entre el último análisis y el anterior. Si era alcista y ahora bajista (o A3 cambió buy↔sell), te lo flagamos porque rompe la tesis previa.',
  },
  rb: {
    label: 'R/B (Riesgo / Beneficio)',
    explanation:
      'Cuánto puedes ganar vs cuánto puedes perder en el setup técnico de A3. R/B = 3 significa que el target está 3× más lejos que el stop. Setups con R/B < 1.5 se descartan en código.',
  },
  stop: {
    label: 'Stop loss',
    explanation:
      'Nivel de precio donde el setup técnico de A3 se invalida. Si el precio lo toca, el trade está roto: hay que cerrarlo asumiendo la pérdida planificada.',
  },
  target: {
    label: 'Target',
    explanation:
      'Nivel de precio donde el setup técnico considera que el movimiento se completó. Es el "objetivo" del trade, no una garantía.',
  },
  entrada: {
    label: 'Entrada',
    explanation:
      'Precio al que A3 considera que el setup técnico se activa. Por encima/abajo de él (según signal) la tesis pierde algo de filo.',
  },
  golden_cross: {
    label: 'Golden cross',
    explanation:
      'Cuando la media móvil corta (SMA 50) cruza por encima de la media móvil larga (SMA 200). Suele leerse como cambio a tendencia alcista de largo plazo.',
  },
  death_cross: {
    label: 'Death cross',
    explanation:
      'Lo contrario: la SMA 50 cruza por debajo de la SMA 200. Suele leerse como cambio a tendencia bajista de largo plazo.',
  },
  atr: {
    label: 'ATR',
    explanation:
      'Average True Range — mide la volatilidad media reciente del activo. A3 lo usa para calibrar stops realistas (no demasiado cerca, no demasiado lejos).',
  },
  vwap: {
    label: 'VWAP',
    explanation:
      'Precio medio ponderado por volumen en una sesión. Operadores institucionales lo usan de referencia: si el precio está por encima, hay presión compradora dominante.',
  },
  cmt: {
    label: 'CMT',
    explanation:
      'Scanner técnico autónomo que recorre tu watchlist y emite señales cuando detecta setups operativos. Independiente del análisis profundo de A4.',
  },
  signal: {
    label: 'Signal (CMT)',
    explanation:
      'Alerta proactiva del scanner CMT con un setup técnico concreto: nivel de urgencia, timeframe, entrada/stop/target. Vive hasta que la marcas como leída.',
  },
  stale: {
    label: 'Stale',
    explanation:
      'El análisis tiene más de 24h. Los datos pueden haber cambiado; vuelve a correrlo para refrescar antes de tomar decisiones.',
  },
  accionable: {
    label: 'Accionable',
    explanation:
      'El precio actual está dentro de un 2% de la entrada del setup técnico. El trade se podría abrir AHORA con poco slippage vs el plan original.',
  },
};

/** Helper: devuelve la entrada del glosario o null si no existe. */
export function lookup(term: string): GlossaryEntry | null {
  const key = term.toLowerCase().trim();
  return GLOSSARY[key] ?? null;
}
