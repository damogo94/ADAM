/**
 * A.D.A.M. — Multi-timeframe (MTF) analysis para A3
 *
 * Refactor Fase D — refina precisión técnica añadiendo confluencia entre
 * timeframes. El timeframe principal (daily) ya lo procesa computeTechnical;
 * aquí agregamos hourly intraday a 4H y comparamos tendencias.
 *
 * Alignment tri-state:
 *   - 'confirmed'  → ambos direccionales (alcista/bajista) en la MISMA dirección
 *   - 'neutral'    → uno o ambos en lateral (consolidación legítima)
 *   - 'divergent'  → ambos direccionales en direcciones OPUESTAS
 *
 * Solo 'confirmed' y 'divergent' tienen efecto en confidence:
 *   - confirmed → +5
 *   - divergent → -10
 *   - neutral   → 0 (no contamina señales de consolidación)
 *
 * Determinismo total. Cero LLM.
 */

import { detectTrend } from './trend';
import type { OHLCVCandle_t, TrendDirection_t } from '@/agents/shared/types';

export interface MtfResult {
  h4_trend: TrendDirection_t;
  h4_fuerza: 1 | 2 | 3 | 4 | 5;
  alignment: 'confirmed' | 'neutral' | 'divergent';
  reason: string;
}

/**
 * Agrega N velas consecutivas en una. Volumen suma, high es el máximo, low el
 * mínimo, open el primero, close el último. Si las velas restantes al final
 * no completan un bucket, se descartan (no agregamos buckets parciales —
 * contaminaría indicadores).
 */
export function aggregateOHLCV(
  candles: OHLCVCandle_t[],
  multiplier: number
): OHLCVCandle_t[] {
  if (multiplier < 2 || !Number.isFinite(multiplier)) return candles.slice();
  const out: OHLCVCandle_t[] = [];
  for (let i = 0; i + multiplier <= candles.length; i += multiplier) {
    const slice = candles.slice(i, i + multiplier);
    const open = slice[0]!.o;
    const close = slice[slice.length - 1]!.c;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let t = slice[0]!.t;
    for (const c of slice) {
      if (c.h > high) high = c.h;
      if (c.l < low) low = c.l;
      volume += c.v;
      // mantenemos el timestamp de la primera vela del bucket (convención)
      if (c.t < t) t = c.t;
    }
    out.push({ t, o: open, h: high, l: low, c: close, v: volume });
  }
  return out;
}

/**
 * Calcula MTF dada la tendencia daily y la serie intraday. Devuelve `null`
 * si no hay datos intraday suficientes (mínimo 24 velas hourly = 6 buckets
 * 4H, que es lo mínimo razonable para detectTrend después de agregar).
 */
export function analyzeMtf(
  dailyTrend: TrendDirection_t,
  intraday: OHLCVCandle_t[] | undefined | null
): MtfResult | null {
  if (!intraday || intraday.length < 24) return null;

  const h4 = aggregateOHLCV(intraday, 4);
  // detectTrend requiere ≥20 velas para señal robusta. Con 24 hourly →
  // 6 buckets de 4H, insuficiente. Si tras agregar tenemos <20, devolvemos
  // null para evitar emitir un trend ruidoso.
  if (h4.length < 20) return null;

  const trend = detectTrend(h4);
  const alignment = classifyAlignment(dailyTrend, trend.primaria);
  const reason = describeAlignment(dailyTrend, trend.primaria, alignment);

  return {
    h4_trend: trend.primaria,
    h4_fuerza: trend.fuerza,
    alignment,
    reason,
  };
}

function classifyAlignment(
  daily: TrendDirection_t,
  h4: TrendDirection_t
): 'confirmed' | 'neutral' | 'divergent' {
  if (daily === 'lateral' || h4 === 'lateral') return 'neutral';
  if (daily === h4) return 'confirmed';
  return 'divergent';
}

function describeAlignment(
  daily: TrendDirection_t,
  h4: TrendDirection_t,
  alignment: 'confirmed' | 'neutral' | 'divergent'
): string {
  if (alignment === 'confirmed') {
    return `Daily ${daily} y 4H ${h4} — confluencia entre timeframes refuerza la señal.`;
  }
  if (alignment === 'divergent') {
    return `Daily ${daily} pero 4H ${h4} — divergencia entre timeframes; cuidado, posible cambio de régimen.`;
  }
  // neutral
  if (daily === 'lateral' && h4 === 'lateral') {
    return 'Ambos timeframes en consolidación — esperar ruptura antes de operar.';
  }
  if (daily === 'lateral') {
    return `Daily lateral, 4H ${h4} — movimiento intradía sin convicción del timeframe superior.`;
  }
  return `Daily ${daily}, 4H lateral — consolidación corta dentro de la tendencia mayor.`;
}

/** Delta de confidence a aplicar sobre A3 según alignment. */
export function mtfConfidenceDelta(alignment: MtfResult['alignment']): number {
  if (alignment === 'confirmed') return 5;
  if (alignment === 'divergent') return -10;
  return 0;
}
