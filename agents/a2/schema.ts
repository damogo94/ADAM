import { z } from 'zod';

export const A2_OUTPUT_SCHEMA = z.object({
  ticker: z.string().min(1).max(20),
  macro_context: z.object({
    ciclo_economico: z.enum(['expansion', 'pico', 'contraccion', 'recuperacion']),
    regimen_tipos: z.enum(['subida', 'pausa', 'bajada']),
    inflacion_trend: z.enum(['subiendo', 'estable', 'bajando']),
    fed_funds_rate_pct: z.number().nullable(),
    us_10y_yield_pct: z.number().nullable(),
    narrative: z.string().min(20).max(2500),
  }),
  factores_clave: z
    .array(
      z.object({
        factor: z.string(),
        impacto: z.enum(['positivo', 'negativo', 'neutral']),
        magnitud: z.number().int().min(1).max(5),
      })
    )
    .max(8),
  correlaciones: z
    .array(
      z.object({
        activo: z.string(),
        correlacion: z.number().min(-1).max(1),
        interpretacion: z.string(),
      })
    )
    .max(6),
  prevision: z.object({
    horizonte: z.enum(['1Y', '3Y', '5Y']),
    rango_esperado: z.string(),
    factor_invalidante: z.string(),
  }),
  opportunity_detected: z.boolean(),
  opportunity_description: z.string().max(1500).nullable(),
  confidence: z.number().int().min(0).max(100),
  narrative: z.string().min(20).max(2500),
});

export type A2Output = z.infer<typeof A2_OUTPUT_SCHEMA>;
