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
    label: 'Veredicto',
    explanation:
      'La conclusión consolidada del sistema (A4) sobre el activo: dirección (positivo/negativo/neutral) + nivel de confianza, ensamblando lo que dijeron A1, A2 y A3. Mismo concepto que "veredicto".',
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
    label: 'Operable ahora',
    explanation:
      'El precio actual está a menos de un 2% de la entrada del setup técnico: el trade se podría abrir AHORA con poco desvío respecto al plan original. (Solo /watchlist — mide la distancia a la entrada, no la fiabilidad del veredicto.)',
  },
  fiabilidad: {
    label: 'Fiabilidad',
    explanation:
      'La cifra grande del veredicto, de 0 a 100: cuánto fiarte de la conclusión. Combina la fuerza de la señal (|net|) con la coincidencia entre las 3 lecturas — si chocan, baja.',
  },
  coincidencia: {
    label: 'Coincidencia (κ)',
    explanation:
      'De 0 a 1: cuánto se confirman entre sí las 3 lecturas (activo, economía, gráfico). Alta = todas apuntan al mismo sitio; baja = se contradicen y la fiabilidad cae.',
  },
  veredicto: {
    label: 'Veredicto',
    explanation:
      'La conclusión consolidada del sistema (A4): dirección (positivo/negativo/neutral) + nivel de confianza, ensamblando lo que dijeron A1, A2 y A3. No es una orden de compra ni de venta.',
  },
  setup: {
    label: 'Setup',
    explanation:
      'La oportunidad o plan operativo del técnico: dirección, zona de entrada, stop y target. Describe cómo se vería el trade si se diera — no es una recomendación de operarlo.',
  },
  mtf: {
    label: 'MTF (multi-temporal)',
    explanation:
      'Mirar el mismo activo en varias escalas de tiempo a la vez (semana / día / horas). Si todas apuntan igual, la lectura se confirma; si chocan, se descuenta.',
  },
  delta: {
    label: 'Cambio (Δ)',
    explanation:
      'Qué cambió respecto al análisis anterior del mismo activo: un giro de dirección (FLIP), una anomalía nueva, o la variación de la confluencia en puntos.',
  },
  hit_rate: {
    label: 'Tasa de acierto',
    explanation:
      'De las señales pasadas que ya se resolvieron, qué porcentaje acertó la dirección. Es historial para calibrar cuánto fiarte — no una promesa de resultados futuros.',
  },
};

/** Helper: devuelve la entrada del glosario o null si no existe. */
export function lookup(term: string): GlossaryEntry | null {
  const key = term.toLowerCase().trim();
  return GLOSSARY[key] ?? null;
}
