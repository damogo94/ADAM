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
  }),
  factor_invalidacion: z.string().max(1000),
  confidence: z.number().int().min(0).max(100),
  narrative: z.string().min(20).max(2500),
});

export type A3Output = z.infer<typeof A3_OUTPUT_SCHEMA>;
