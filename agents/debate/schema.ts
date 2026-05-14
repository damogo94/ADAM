import { z } from 'zod';

export const DEBATE_OUTPUT_SCHEMA = z.object({
  ticker: z.string().min(1).max(20),
  convergence_score: z.number().int().min(0).max(100),
  argumento_a1: z.string().min(20),
  argumento_a2: z.string().min(20),
  puntos_convergencia: z.array(z.string()).max(5),
  puntos_divergencia: z.array(z.string()).max(5),
  punto_critico_de_debate: z.string(),
  oportunidad_validada: z.boolean(),
  direccion: z.enum(['alcista', 'bajista', 'neutral']),
  horizonte_relevante: z.string(),
  recomendacion_consolidada: z.string().min(40),
  factor_invalidante: z.string(),
});

export type DebateOutput = z.infer<typeof DEBATE_OUTPUT_SCHEMA>;
