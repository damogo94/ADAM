import { resolveError } from '@/lib/errors';
import type { A1Output_t as A1Output, A2Output_t as A2Output } from '@/agents/shared/types';
import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';
import type { RunState, StreamEvent } from './types';

/**
 * Reductor PURO del stream NDJSON de /analysis: `(state, event) => state`.
 *
 * Extraído del closure inline de la page para poder TESTEAR la honestidad sin SDK
 * ni red, y como base del shell persistente (B1): el provider hará
 * `setState(s => applyRunEvent(s, ev))`.
 *
 * LÍNEA ROJA DE HONESTIDAD (congelada en apply-event.test.ts): ningún estado
 * "completado" se fabrica — cada `*Status` solo cambia con SU evento real.
 *   - `agent`: actualiza SOLO el agente cuyo evento llegó (status = el del stream).
 *   - `debate`: enciende solo si llegó dato de debate (si no, vuelve a idle).
 *   - `final`: resuelve A4 y rescata agentes colgados en `scanning` derivando su
 *     estado SOLO de si llegó su dato (no inventa done).
 *   - `fatal`: todo a error + UserError clasificado.
 *
 * Es una función pura: sin setState, sin red, sin Date.now/Math.random.
 */
export function applyRunEvent(s: RunState, ev: StreamEvent): RunState {
  switch (ev.type) {
    case 'agent': {
      if (ev.agent === 'a1') return { ...s, a1: ev.data as A1Output | null, a1Status: ev.status };
      if (ev.agent === 'a2') return { ...s, a2: ev.data as A2Output | null, a2Status: ev.status };
      if (ev.agent === 'a3') return { ...s, a3: ev.data as A3Output | null, a3Status: ev.status };
      return s;
    }
    case 'debate': {
      const debate = ev.data as DebateOutput | null;
      return { ...s, debate, debateStatus: debate ? 'done' : 'idle' };
    }
    case 'final':
      return {
        ...s,
        a4: ev.a4,
        a4Status: 'done',
        analysisId: ev.analysis_id ?? null,
        traceId: ev.meta?.traceId ?? s.traceId,
        durationMs: ev.meta?.durationMs ?? s.durationMs,
        // Si algún evento de agente se perdió, no dejes su card en scanning: deriva
        // su estado SOLO del dato realmente recibido (sin fabricar "done").
        a1Status:
          s.a1Status === 'scanning'
            ? s.a1
              ? s.a1.anomaly_detected
                ? 'anomaly'
                : 'done'
              : 'error'
            : s.a1Status,
        a3Status: s.a3Status === 'scanning' ? (s.a3 ? 'done' : 'error') : s.a3Status,
        partial: !!ev.partial,
        failures: ev.failures ?? [],
        dailyCandles: ev.chart_data?.daily ?? s.dailyCandles,
      };
    case 'fatal':
      return {
        ...s,
        a1Status: 'error',
        a2Status: 'error',
        a3Status: 'error',
        a4Status: 'error',
        error: resolveError({ error: ev.error, detail: ev.detail, failures: ev.failures }),
        partial: false,
        failures: ev.failures ?? [],
      };
    default:
      return s;
  }
}
