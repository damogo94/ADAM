import { buildSignalTradePlan } from '@/lib/backtest/signal-plan';

/**
 * Trade (operación accionable) extraído de un análisis guardado: niveles + R/B +
 * horizonte. Es la salida que "más importa"; el resto del análisis es soporte.
 */
export interface TradeSummary {
  signal: 'buy' | 'sell';
  entrada: number;
  stop_loss: number;
  target: number;
  /** R/B prometido (≥1.5 forzado en A3). null si un output viejo no lo trae. */
  rb: number | null;
  horizonte: 'intradia' | 'swing' | 'posicional' | null;
}

/** Resultado evaluado del trade (cron evaluate-trades → trade_outcomes). */
export interface TradeOutcomeSummary {
  /** win | loss | timeout | no_fill | not_evaluable */
  outcome: string;
  r_multiple: number | null;
  return_pct: number | null;
  resolved_days: number | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/**
 * Extrae el trade de un `a3_output` (jsonb → unknown). Un análisis "genera un
 * trade" cuando A3 emite una operativa accionable: `signal` buy/sell + entrada,
 * stop y target numéricos + geometría COHERENTE con la señal. La dirección
 * reportada es la de A3 (`operativa.signal`) — la misma que el cron de evaluación
 * persiste en `trade_outcomes.direction`; `buildSignalTradePlan` solo se usa para
 * rechazar geometría degenerada o invertida (no para fijar la dirección). Devuelve
 * null para 'hold', niveles ausentes o incoherentes → "solo análisis, sin trade".
 */
export function extractTradeSummary(a3Output: unknown): TradeSummary | null {
  const op = asRecord(asRecord(a3Output)?.operativa);
  if (!op) return null;
  const signal = op.signal;
  if (signal !== 'buy' && signal !== 'sell') return null;

  const { entrada, stop_loss, target, ratio_riesgo_beneficio, horizonte } = op;
  if (typeof entrada !== 'number' || typeof stop_loss !== 'number' || typeof target !== 'number') {
    return null;
  }

  // Rechaza niveles degenerados (riesgo/recorrido nulo) o incoherentes con la
  // señal (p.ej. signal=buy con target<entrada) en vez de voltear la dirección
  // en silencio. La dirección sale de A3 (signal), no de la geometría inferida.
  const plan = buildSignalTradePlan(entrada, stop_loss, target);
  if (!plan || plan.direction !== signal) return null;

  return {
    signal,
    entrada,
    stop_loss,
    target,
    rb: typeof ratio_riesgo_beneficio === 'number' ? ratio_riesgo_beneficio : null,
    horizonte:
      horizonte === 'intradia' || horizonte === 'swing' || horizonte === 'posicional'
        ? horizonte
        : null,
  };
}
