import { z } from 'zod';

export const DEBATE_OUTPUT_SCHEMA = z.object({
  ticker: z.string().min(1).max(20),
  convergence_score: z.number().int().min(0).max(100),
  argumento_a1: z.string().min(20).max(2000),
  argumento_a2: z.string().min(20).max(2000),
  puntos_convergencia: z.array(z.string().max(600)).max(5),
  puntos_divergencia: z.array(z.string().max(600)).max(5),
  punto_critico_de_debate: z.string().max(1000),
  oportunidad_validada: z.boolean(),
  direccion: z.enum(['alcista', 'bajista', 'neutral']),
  horizonte_relevante: z.string().max(500),
  recomendacion_consolidada: z.string().min(40).max(2500),
  factor_invalidante: z.string().max(1000),
});

export type DebateOutput = z.infer<typeof DEBATE_OUTPUT_SCHEMA>;
