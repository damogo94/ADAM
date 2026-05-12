import { z } from 'zod';

/**
 * Contrato JSON de salida de A1 — Especialista en Activos.
 * Si el LLM devuelve algo que no valida, A4 lo trata como error y baja la confianza.
 */
export const A1_OUTPUT_SCHEMA = z.object({
  ticker: z.string().min(1).max(20),
  asset_type: z.enum(['equity', 'etf', 'crypto', 'forex', 'commodity', 'bond']),
  price: z.object({
    current: z.number(),
    change_pct_24h: z.number(),
    change_pct_7d: z.number(),
    currency: z.string().length(3).or(z.literal('USDT')),
  }),
  fundamentals: z.object({
    per: z.number().nullable(),
    peg: z.number().nullable(),
    ev_ebitda: z.number().nullable(),
    fcf_yield_pct: z.number().nullable(),
    dividend_yield_pct: z.number().nullable(),
    market_cap_usd: z.number().nullable(),
  }),
  news: z
    .array(
      z.object({
        headline: z.string(),
        source: z.string(),
        sentiment: z.enum(['bullish', 'bearish', 'neutral']),
        relevance: z.number().int().min(1).max(5),
      })
    )
    .max(10),
  anomaly_detected: z.boolean(),
  anomaly_type: z
    .enum(['anomalia', 'vulnerabilidad', 'oportunidad'])
    .nullable(),
  anomaly_description: z.string(),
  confidence: z.number().int().min(1).max(5),
  narrative: z.string().min(20),
});

export type A1Output = z.infer<typeof A1_OUTPUT_SCHEMA>;
