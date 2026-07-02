import { z } from 'zod';

/**
 * A3 schema — price action puro.
 *
 * ⚠️ Este schema es deliberadamente estricto: NO incluye campos que pudieran
 *    invitar a contaminar A3 con sentiment/macro/news. Si en el futuro alguien
 *    propone añadir un campo aquí, primero verificar que respeta la regla
 *    absoluta #1 (aislamiento total de A3).
 */
export const A3_OUTPUT_SCHEMA = z.object({
  ticker: z.string().min(1).max(20),
  timeframes_analizados: z.array(z.string()).min(1).max(4),
  tendencia: z.object({
    primaria: z.enum(['alcista', 'bajista', 'lateral']),
    secundaria: z.enum(['alcista', 'bajista', 'lateral']),
    fuerza: z.number().int().min(1).max(5),
  }),
  soportes: z.array(z.number()).max(5),
  resistencias: z.array(z.number()).max(5),
  patron_detectado: z.string().nullable(),
  medias: z.object({
    sma20: z.number().nullable(),
    sma50: z.number().nullable(),
    sma200: z.number().nullable(),
    vwap: z.number().nullable(),
    golden_cross: z.boolean(),
    death_cross: z.boolean(),
  }),
  volumen: z.object({
    estado: z.enum([
      'creciente',
      'estable',
      'decreciente',
      'divergencia_alcista',
      'divergencia_bajista',
    ]),
    comentario: z.string(),
  }),
  velas_relevantes: z.array(z.string()).max(5),
  operativa: z.object({
    signal: z.enum(['buy', 'sell', 'hold']),
    entrada: z.number().nullable(),
    stop_loss: z.number().nullable(),
    target: z.number().nullable(),
    atr_actual: z.number().nullable(),
    ratio_riesgo_beneficio: z.number().nullable(),
    horizonte: z.enum(['intradia', 'swing', 'posicional']),
    // Consolidado con agents/shared/types.ts (F8/ADR-003): el compute
    // (computeOperativa) emite entry_type; sin este campo el schema no-strict
    // lo descartaba en silencio en la ruta runA3. nullable/optional para no
    // romper runs antiguos ni el hold (entry_type null).
    entry_type: z.enum(['market', 'limit']).nullable().optional(),
  }),
  factor_invalidacion: z.string().max(1000),
  /**
   * Multi-timeframe — confluencia entre daily y 4H agregado.
   * null cuando no hay intraday suficiente para evaluar.
   */
  mtf: z
    .object({
      h4_trend: z.enum(['alcista', 'bajista', 'lateral']),
      h4_fuerza: z.number().int().min(1).max(5),
      alignment: z.enum(['confirmed', 'neutral', 'divergent']),
      reason: z.string().max(500),
    })
    .nullable()
    .optional(),
  confidence: z.number().int().min(0).max(100),
  narrative: z.string().min(20).max(2500),
});

export type A3Output = z.infer<typeof A3_OUTPUT_SCHEMA>;
