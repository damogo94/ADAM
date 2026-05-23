/**
 * Normaliza un row de `analyses_log` (jsonb crudo) a un
 * `RadarAnalysisSnapshot_t` plano. Aplica Zod safeParse: cualquier
 * desviación del schema NO tira la fila — devolvemos null y el caller
 * trata el ticker como "sin análisis válido". Mejor degradar que 500
 * la página entera por un row corrupto.
 *
 * Genera además `headline` (una sola frase sintética) leyendo
 * `a4_output.accion_sugerida` si existe, recortado a 140 chars.
 */

import { A1FromLog, A3FromLog, A4FromLog, type RadarAnalysisSnapshot_t } from './types';

/** Estructura mínima que esperamos de un row crudo de analyses_log. */
interface AnalysisLogRowRaw {
  id?: unknown;
  created_at?: unknown;
  confluence_pct?: unknown;
  direction?: unknown;
  confidence?: unknown;
  a1_output?: unknown;
  a3_output?: unknown;
  a4_output?: unknown;
}

const HEADLINE_MAX = 140;

export function normalizeAnalysis(raw: unknown): RadarAnalysisSnapshot_t | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as AnalysisLogRowRaw;

  if (typeof r.id !== 'string') return null;
  if (typeof r.created_at !== 'string') return null;
  if (typeof r.confluence_pct !== 'number') return null;
  if (typeof r.direction !== 'string') return null;
  if (typeof r.confidence !== 'string') return null;

  const a1 = A1FromLog.safeParse(r.a1_output);
  const a3 = A3FromLog.safeParse(r.a3_output);
  const a4 = A4FromLog.safeParse(r.a4_output);

  if (!a4.success) {
    // A4 es load-bearing — sin él no hay dictamen.
    return null;
  }

  const a3op = a3.success ? a3.data.operativa : undefined;
  const headline = buildHeadline(a4.data.accion_sugerida);

  // Validamos los enums explícitamente; si vienen valores raros, tiramos null.
  if (r.direction !== 'positivo' && r.direction !== 'negativo' && r.direction !== 'neutral') {
    return null;
  }
  if (r.confidence !== 'alta' && r.confidence !== 'media' && r.confidence !== 'baja') {
    return null;
  }

  return {
    id: r.id,
    created_at: r.created_at,
    confluence_pct: clamp0to100(r.confluence_pct),
    direction: r.direction,
    confidence: r.confidence,
    a3_signal: a3op?.signal ?? null,
    a3_entry: a3op?.entrada ?? null,
    a3_stop: a3op?.stop_loss ?? null,
    a3_target: a3op?.target ?? null,
    a3_risk_reward: a3op?.ratio_riesgo_beneficio ?? null,
    a1_anomaly_detected: a1.success ? a1.data.anomaly_detected === true : false,
    a1_anomaly_type: a1.success ? a1.data.anomaly_type ?? null : null,
    a1_anomaly_description:
      a1.success && typeof a1.data.anomaly_description === 'string'
        ? a1.data.anomaly_description
        : null,
    headline,
  };
}

function buildHeadline(accion?: string): string {
  if (!accion || typeof accion !== 'string') return 'sin dictamen';
  const trimmed = accion.trim();
  if (trimmed.length === 0) return 'sin dictamen';
  if (trimmed.length <= HEADLINE_MAX) return trimmed;
  // Corta en el último espacio antes del límite para no partir palabras.
  const slice = trimmed.slice(0, HEADLINE_MAX);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 80 ? slice.slice(0, lastSpace) : slice) + '…';
}

function clamp0to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
