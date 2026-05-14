import { z } from 'zod';

const ConfluenceLevel = z.enum(['baja', 'media', 'alta']);

export const A4_OUTPUT_SCHEMA = z.object({
  ticker: z.string().min(1).max(20),
  confluence: z.object({
    a3_solo: z.object({
      score: z.number().int().min(0).max(100),
      nivel: z.literal('baja'), // A3 solo NEVER produces "alta" — by definition
    }),
    a1_a2: z.object({
      score: z.number().int().min(0).max(100),
      nivel: ConfluenceLevel,
    }),
    alineados: z.object({
      score: z.number().int().min(0).max(100),
      nivel: ConfluenceLevel,
    }),
    score_total_pct: z.number().int().min(0).max(100),
    nivel_final: ConfluenceLevel,
  }),
  resumen_a1: z.string().min(20).max(600),
  resumen_a2: z.string().min(20).max(600),
  resumen_a3: z.string().min(20).max(600),
  direccion: z.enum(['positivo', 'negativo', 'neutral']),
  confianza: ConfluenceLevel,
  accion_sugerida: z.string().min(40).max(1000),
  riesgo_clave: z.string().min(10).max(500),
  disclaimer: z.literal(
    'Análisis educativo · no constituye asesoramiento financiero regulado'
  ),
});

export type A4Output = z.infer<typeof A4_OUTPUT_SCHEMA>;
