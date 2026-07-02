/**
 * Normaliza un row de `signals_history` (jsonb crudo desde la RPC) al
 * `RadarSignal_t` plano que consume el UI.
 *
 * Defensiva igual que `normalize.ts`: row inválido → null.
 */

import type { RadarSignal_t } from './types';

interface SignalRowRaw {
  id?: unknown;
  level?: unknown;
  timeframe?: unknown;
  setup_detected?: unknown;
  confidence_pct?: unknown;
  emitted_at?: unknown;
  // Niveles accionables (opcionales en signals_history — pueden faltar).
  entry_price?: unknown;
  stop_loss?: unknown;
  target_price?: unknown;
  risk_reward_ratio?: unknown;
  invalidation_factor?: unknown;
}

const VALID_LEVELS = new Set(['urgente', 'atencion', 'monitorear', 'sin_senal']);

/** Numérico finito o null (defensivo: NaN/Infinity/otros tipos → null). */
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** String o null (defensivo). */
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function normalizeSignal(raw: unknown): RadarSignal_t | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as SignalRowRaw;

  if (typeof r.id !== 'string') return null;
  if (typeof r.level !== 'string' || !VALID_LEVELS.has(r.level)) return null;
  if (typeof r.timeframe !== 'string') return null;
  if (typeof r.setup_detected !== 'string') return null;
  if (typeof r.confidence_pct !== 'number') return null;
  if (typeof r.emitted_at !== 'string') return null;

  return {
    id: r.id,
    level: r.level as RadarSignal_t['level'],
    timeframe: r.timeframe,
    setup_detected: r.setup_detected,
    confidence_pct: Math.max(0, Math.min(100, Math.round(r.confidence_pct))),
    emitted_at: r.emitted_at,
    // El outcome de backtest se rellena en el endpoint (lectura best-effort
    // acotada por RLS). Aquí siempre null.
    outcome: null,
    // Niveles accionables — opcionales en el origen (signals_history). Si
    // faltan o no son del tipo esperado → null (NO se descarta la señal).
    entrada: numOrNull(r.entry_price),
    stop_loss: numOrNull(r.stop_loss),
    target: numOrNull(r.target_price),
    risk_reward: numOrNull(r.risk_reward_ratio),
    invalidation: strOrNull(r.invalidation_factor),
  };
}
