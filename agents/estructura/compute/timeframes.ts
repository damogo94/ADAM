/**
 * A.D.A.M. — Estructura · derivación de temporalidades
 *
 * El manual sincroniza Weekly / Daily / H4 / H1. La capa de datos de ADAM
 * solo sirve daily (hasta 1 año) + hourly (5 días). Aquí derivamos las
 * cuatro a partir de esas dos series reutilizando `aggregateOHLCV` de A3:
 *
 *   - Weekly = daily agregado ×5 (5 sesiones bursátiles ≈ 1 semana)
 *   - Daily  = la propia serie diaria
 *   - H4     = hourly agregado ×4
 *   - H1     = la propia serie horaria
 *
 * Cada timeframe se devuelve solo si tiene suficientes velas para una lectura
 * estructural robusta (≥ MIN_VELAS); si no, `null` (y el agente degrada).
 */

import { aggregateOHLCV } from '@/agents/a3/compute/mtf';
import type { OHLCVCandle_t } from '@/agents/shared/types';

/** Mínimo de velas para intentar leer estructura en un timeframe. */
export const MIN_VELAS_ESTRUCTURA = 20;

export interface TimeframeSeries {
  weekly: OHLCVCandle_t[] | null;
  daily: OHLCVCandle_t[];
  h4: OHLCVCandle_t[] | null;
  h1: OHLCVCandle_t[] | null;
}

/**
 * Deriva las cuatro series a partir de daily + intraday(hourly).
 *
 * `daily` es obligatorio (es el "terreno de juego" del manual §1). `intraday`
 * es opcional; sin él, H4/H1 quedan `null` y el agente opera solo con la
 * estructura Weekly/Daily (degradación honesta, no error).
 */
export function deriveTimeframes(
  daily: OHLCVCandle_t[],
  intraday: OHLCVCandle_t[] | null | undefined
): TimeframeSeries {
  const weeklyAgg = aggregateOHLCV(daily, 5);
  const weekly = weeklyAgg.length >= MIN_VELAS_ESTRUCTURA ? weeklyAgg : null;

  let h4: OHLCVCandle_t[] | null = null;
  let h1: OHLCVCandle_t[] | null = null;
  if (intraday && intraday.length >= MIN_VELAS_ESTRUCTURA) {
    h1 = intraday;
    const h4Agg = aggregateOHLCV(intraday, 4);
    h4 = h4Agg.length >= MIN_VELAS_ESTRUCTURA ? h4Agg : null;
  }

  return { weekly, daily, h4, h1 };
}
