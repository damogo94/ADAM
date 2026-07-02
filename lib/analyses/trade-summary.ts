import { buildSignalTradePlan } from '@/lib/backtest/signal-plan';
import { horizonteFromEstructuraTimeframe } from '@/lib/analyses/horizon';

/**
 * Fuente del trade dentro de un análisis:
 *   - 'a3'        → operativa del motor técnico aislado (Gráfico). Trade PRIMARIO
 *                   para métricas: es el que el cron `evaluate-trades` backtestea.
 *   - 'estructura'→ plan del agente de Estructura (MTF, futuros). Trade PARALELO,
 *                   opt-in; aún NO se evalúa automáticamente (fase posterior).
 */
export type TradeSource = 'a3' | 'estructura';

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
  /** De qué agente sale el trade (A3 primario · Estructura paralelo). */
  source: TradeSource;
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
    source: 'a3',
  };
}

/**
 * Estados de `setup.estado` (Estructura) que llevan un plan con GEOMETRÍA COMPLETA
 * y R/B válido (ver `agents/estructura/compute/ejecucion.ts`):
 *   - 'listo'                 → zona + gatillo presentes, plan ejecutable.
 *   - 'esperando_confirmacion'→ precio en zona con niveles/R-B válidos, falta el
 *                               gatillo (M/W/ruptura). El plan ya tiene geometría.
 * El resto (`sin_estructura` · `esperando_zona` · `sin_setup`) NO tiene niveles
 * accionables (`gestion` = vacía) → no hay trade.
 */
const ESTRUCTURA_ESTADOS_ACCIONABLES = new Set(['listo', 'esperando_confirmacion']);

/** Mapea la dirección del setup de Estructura a la señal de trade. */
function estructuraSignal(direccion: unknown): 'buy' | 'sell' | null {
  if (direccion === 'compra') return 'buy';
  if (direccion === 'venta') return 'sell';
  return null;
}

/**
 * Extrae el trade PARALELO del agente de Estructura desde `estructura_output`
 * (jsonb → unknown). NULL-SAFE: `estructura_output` es opt-in / nullable, así que
 * devuelve `null` si es null/undefined, si `setup.estado` no es accionable, o si la
 * geometría (entrada/stop/target/dirección) no es coherente — mismo criterio que
 * `extractTradeSummary` (A3): `buildSignalTradePlan` rechaza geometría degenerada o
 * invertida y la dirección sale del setup (`direccion`), no de la geometría inferida.
 *
 * El horizonte se deriva de `setup.timeframe_entrada` vía `horizonteFromEstructuraTimeframe`
 * (1H/4H→intradía · 1D→swing · 1W→posicional). `source` = 'estructura'.
 */
export function extractEstructuraTradeSummary(estructuraOutput: unknown): TradeSummary | null {
  const root = asRecord(estructuraOutput);
  if (!root) return null;

  const setup = asRecord(root.setup);
  const gestion = asRecord(root.gestion);
  if (!setup || !gestion) return null;

  const estado = setup.estado;
  if (typeof estado !== 'string' || !ESTRUCTURA_ESTADOS_ACCIONABLES.has(estado)) return null;

  const signal = estructuraSignal(setup.direccion);
  if (!signal) return null;

  const { entrada, stop_loss, take_profit, ratio_riesgo_beneficio } = gestion;
  if (
    typeof entrada !== 'number' ||
    typeof stop_loss !== 'number' ||
    typeof take_profit !== 'number'
  ) {
    return null;
  }

  // Rechaza geometría degenerada/invertida (idéntico a A3). La dirección la fija el
  // setup de Estructura; la geometría solo valida, no vuelca el sentido en silencio.
  const plan = buildSignalTradePlan(entrada, stop_loss, take_profit);
  if (!plan || plan.direction !== signal) return null;

  const timeframeEntrada = typeof setup.timeframe_entrada === 'string' ? setup.timeframe_entrada : null;

  return {
    signal,
    entrada,
    stop_loss,
    target: take_profit,
    rb: typeof ratio_riesgo_beneficio === 'number' ? ratio_riesgo_beneficio : null,
    horizonte: horizonteFromEstructuraTimeframe(timeframeEntrada),
    source: 'estructura',
  };
}
