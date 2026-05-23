/**
 * Tipos y schemas Zod del módulo sparkline.
 *
 * Convención: la SERIE es un array de cierres diarios (close prices)
 * normalizados, ya recortados al rango pedido. La página solo necesita
 * los closes — el sparkline no muestra ejes ni volumen, así que NO
 * exponemos OHLCV completo (menos peso de respuesta).
 */

import { z } from 'zod';

export const SparklineRange = z.enum(['7d', '30d']);
export type SparklineRange_t = z.infer<typeof SparklineRange>;

export const SparklineSeries = z
  .object({
    symbol: z.string().min(1).max(20),
    range: SparklineRange,
    /** Cierres en orden cronológico (ascendente). Vacío si no hay datos. */
    closes: z.array(z.number().finite()),
    /** Timestamp ISO de cuándo se generó esta serie (server-side, no fiable de cliente). */
    generated_at: z.string(),
    /** Si vino del cache Upstash (true) o se calculó ahora (false). Diagnóstico. */
    cached: z.boolean(),
    /** Mensaje de error si la serie está vacía por fallo. */
    error: z.string().optional(),
  })
  .strict();
export type SparklineSeries_t = z.infer<typeof SparklineSeries>;

export const SparklinesResponse = z
  .object({
    series: z.array(SparklineSeries),
    generated_at: z.string(),
  })
  .strict();
export type SparklinesResponse_t = z.infer<typeof SparklinesResponse>;

/** Mapa rango → número de cierres a devolver. */
export const RANGE_POINTS: Record<SparklineRange_t, number> = {
  '7d': 7,
  '30d': 30,
};
