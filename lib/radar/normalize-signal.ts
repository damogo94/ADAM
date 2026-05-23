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
}

const VALID_LEVELS = new Set(['urgente', 'atencion', 'monitorear', 'sin_senal']);

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
  };
}
