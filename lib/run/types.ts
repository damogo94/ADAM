import type {
  A1Output_t as A1Output,
  A2Output_t as A2Output,
  A4Output_t as A4Output,
} from '@/agents/shared/types';
import type { A3Output } from '@/agents/a3/schema';
import type { EstructuraOutput_t } from '@/agents/estructura/schema';
import type { DebateOutput } from '@/agents/debate/schema';
import type { AgentStatus } from '@/components/agent-card-shell';
import type { UserError } from '@/lib/errors';

/**
 * Tipos del "run" de /analysis, extraídos de la page para que el reductor puro
 * (`apply-event.ts`) y sus tests puedan importarlos sin arrastrar el componente
 * cliente. Es la base sobre la que se monta el shell persistente (B1): el estado
 * del run se elevará a un provider que reutiliza estos tipos + el reductor.
 */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Eventos NDJSON que emite /api/agents/run (streaming). */
export type StreamEvent =
  | { type: 'agent'; agent: 'a1' | 'a2' | 'a3'; status: AgentStatus; data: unknown }
  | { type: 'debate'; status: 'done' | 'skipped'; data: unknown }
  | {
      type: 'final';
      analysis_id?: string | null;
      a4: A4Output;
      meta?: { traceId?: string; durationMs?: number; debateRan?: boolean };
      partial?: boolean;
      failures?: { agent: string; message: string }[];
      chart_data?: { daily: Candle[] };
    }
  | { type: 'fatal'; error: string; detail?: string; failures?: { agent: string; message: string }[] };

export interface RunState {
  ticker: string | null;
  a1Status: AgentStatus;
  a2Status: AgentStatus;
  a3Status: AgentStatus;
  debateStatus: AgentStatus;
  a4Status: AgentStatus;
  a1: A1Output | null;
  a2: A2Output | null;
  a3: A3Output | null;
  debate: DebateOutput | null;
  a4: A4Output | null;
  estructura: EstructuraOutput_t | null;
  estructuraStatus: AgentStatus;
  /** id de la fila persistida (evento `final`) — lo usa el re-narrado con EST. */
  analysisId: string | null;
  /** Trazado del run (evento `final`): id de soporte + duración. Meta antes sin exponer. */
  traceId: string | null;
  durationMs: number | null;
  error: UserError | null;
  partial: boolean;
  failures: { agent: string; message: string }[];
  dailyCandles: Candle[];
  /** Estado de "Fijar alerta CMT" (post-resolve, Fase 1C·C1). */
  alerta: 'idle' | 'pinning' | 'pinned' | 'error';
}

export const INITIAL: RunState = {
  ticker: null,
  a1Status: 'idle',
  a2Status: 'idle',
  a3Status: 'idle',
  debateStatus: 'idle',
  a4Status: 'idle',
  a1: null,
  a2: null,
  a3: null,
  debate: null,
  a4: null,
  estructura: null,
  estructuraStatus: 'idle',
  analysisId: null,
  traceId: null,
  durationMs: null,
  error: null,
  partial: false,
  failures: [],
  dailyCandles: [],
  alerta: 'idle',
};
