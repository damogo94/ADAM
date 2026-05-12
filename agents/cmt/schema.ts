import { z } from 'zod';

export const CMT_LEVELS = ['urgente', 'atencion', 'monitorear', 'sin_senal'] as const;
export type CMTLevel = (typeof CMT_LEVELS)[number];

export const CMT_OUTPUT_SCHEMA = z.object({
  ticker: z.string().min(1).max(20),
  level: z.enum(CMT_LEVELS),
  timeframe: z.string().min(1).max(10),
  setup_detected: z.string().min(3).max(300),
  confidence_pct: z.number().int().min(0).max(100),
  entry_price: z.number().nullable(),
  stop_loss: z.number().nullable(),
  target_price: z.number().nullable(),
  risk_reward_ratio: z.number().nullable(),
  indicators: z.record(z.string(), z.string()).refine((r) => Object.keys(r).length <= 5, {
    message: 'indicators máximo 5 entradas',
  }),
  invalidation_factor: z.string().min(3).max(300),
});

export type CMTOutput = z.infer<typeof CMT_OUTPUT_SCHEMA>;
