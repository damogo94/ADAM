/**
 * Tipos compartidos a lo largo de A.D.A.M.
 * Para tipos de output de cada agente, importar desde @/agents/<name>/schema.
 */

import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';
import type { A3Output } from '@/agents/a3/schema';
import type { A4Output } from '@/agents/a4/schema';
import type { DebateOutput } from '@/agents/debate/schema';

export type AgentId = 'a1' | 'a2' | 'a3' | 'a4' | 'debate';

export type AgentStatus = 'idle' | 'scanning' | 'done' | 'error' | 'anomaly';

export interface AgentState<T> {
  id: AgentId;
  status: AgentStatus;
  output: T | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface AnalysisRun {
  ticker: string;
  startedAt: number;
  a1: AgentState<A1Output>;
  a2: AgentState<A2Output>;
  a3: AgentState<A3Output>;
  debate: AgentState<DebateOutput> | null;
  a4: AgentState<A4Output> | null;
}

// CMT alert levels (módulo CMT autónomo)
export type CMTLevel = 'urgente' | 'atencion' | 'monitorear' | 'sin_senal';

export interface CMTSignal {
  id: string;
  ticker: string;
  level: CMTLevel;
  setup: string;
  confidence_pct: number;
  entrada: number | null;
  stop: number | null;
  target: number | null;
  ratio_rb: number | null;
  timeframe: string;
  factor_invalidacion: string;
  detected_at: number;
}
