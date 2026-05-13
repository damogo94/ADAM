'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { AssetInput } from '@/components/asset-input';
import { SectionLabel, FlowArrow } from '@/components/section-label';
import { A1Card } from '@/components/agents/a1-card';
import { A2Card } from '@/components/agents/a2-card';
import { A3Card } from '@/components/agents/a3-card';
import { DebateCard } from '@/components/agents/debate-card';
import { A4Card } from '@/components/agents/a4-card';
import { ConfluenceIndicator } from '@/components/confluence-indicator';
import { computeConfluence, type ConfluenceResult } from '@/lib/confluence';
import { resolveError, networkError, type UserError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { A1Output } from '@/agents/a1/schema';
import type { A2Output } from '@/agents/a2/schema';
import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';
import type { A4Output } from '@/agents/a4/schema';
import type { AgentStatus } from '@/components/agent-card-shell';

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

interface RunState {
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
  error: UserError | null;
  partial: boolean;
  failures: { agent: string; message: string }[];
  dailyCandles: Candle[];
}

const INITIAL: RunState = {
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
  error: null,
  partial: false,
  failures: [],
  dailyCandles: [],
};

export default function AnalysisScreen() {
  const [state, setState] = useState<RunState>(INITIAL);
  const search = useSearchParams();
  const router = useRouter();
  const autoTicker = search.get('ticker');
  const autoRanRef = useRef<string | null>(null);

  // Auto-trigger cuando viene desde /watchlist con ?ticker=X
  useEffect(() => {
    if (autoTicker && autoRanRef.current !== autoTicker) {
      autoRanRef.current = autoTicker;
      void handleRun(autoTicker.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTicker]);

  async function handleRun(ticker: string) {
    setState({
      ...INITIAL,
      ticker,
      a1Status: 'scanning',
      a2Status: 'scanning',
      a3Status: 'scanning',
    });

    try {
      const res = await fetch('/api/agents/a4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login?next=/analysis');
          return;
        }
        const userErr = resolveError(data);
        setState((s) => ({
          ...s,
          a1Status: 'error',
          a2Status: 'error',
          a3Status: 'error',
          debateStatus: 'idle',
          a4Status: 'error',
          error: userErr,
          partial: false,
          failures: data.failures ?? [],
        }));
        return;
      }

      const { a1, a2, a3, debate, a4, partial, failures, chart_data } = data as {
        a1: A1Output | null;
        a2: A2Output | null;
        a3: A3Output | null;
        debate: DebateOutput | null;
        a4: A4Output;
        partial?: boolean;
        failures?: { agent: string; message: string }[];
        chart_data?: { daily: Candle[] };
      };

      setState({
        ticker,
        a1Status: !a1 ? 'error' : a1.anomaly_detected ? 'anomaly' : 'done',
        a2Status: !a2 ? 'error' : a2.opportunity_detected ? 'anomaly' : 'done',
        a3Status: !a3 ? 'error' : 'done',
        debateStatus: debate ? 'done' : 'idle',
        a4Status: 'done',
        a1,
        a2,
        a3,
        debate,
        a4,
        error: null,
        partial: !!partial,
        failures: failures ?? [],
        dailyCandles: chart_data?.daily ?? [],
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        a1Status: 'error',
        a2Status: 'error',
        a3Status: 'error',
        a4Status: 'error',
        error: networkError(e),
        partial: false,
        failures: [],
      }));
    }
  }

  const isLoading =
    state.a1Status === 'scanning' || state.a2Status === 'scanning' || state.a3Status === 'scanning';
  const headerStatus = state.error
    ? 'error'
    : state.a4Status === 'done'
      ? 'ok'
      : isLoading
        ? 'running'
        : 'offline';

  const confluence: ConfluenceResult | null =
    state.a3 || state.a1 ? computeConfluence(state.a1, state.a2, state.a3, state.debate) : null;

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={headerStatus} />

      <AssetInput onSubmit={handleRun} disabled={isLoading} />

      {state.error && (
        <div
          className={cn(
            'mx-4 mt-3 rounded-lg border px-3 py-2.5',
            state.error.tone === 'rate_limit' && 'border-a3/30 bg-a3/10',
            state.error.tone === 'transient' && 'border-a2/30 bg-a2/10',
            state.error.tone === 'auth' && 'border-a1/30 bg-a1/10',
            state.error.tone === 'partial' && 'border-a3/30 bg-a3/10',
            state.error.tone === 'fatal' && 'border-rose/30 bg-rose/10'
          )}
        >
          <div
            className={cn(
              'font-orbitron text-[10px] font-bold tracking-wider mb-0.5',
              state.error.tone === 'rate_limit' && 'text-a3',
              state.error.tone === 'transient' && 'text-a2',
              state.error.tone === 'auth' && 'text-a1',
              state.error.tone === 'partial' && 'text-a3',
              state.error.tone === 'fatal' && 'text-rose'
            )}
          >
            {state.error.title}
          </div>
          <div className="font-mono text-[10px] leading-snug text-white">{state.error.message}</div>
        </div>
      )}

      {state.partial && state.failures.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-a3/30 bg-a3/[0.07] px-3 py-2">
          <div className="font-orbitron text-[10px] font-bold tracking-wider text-a3 mb-0.5">ANÁLISIS PARCIAL</div>
          <div className="font-mono text-[10px] leading-snug text-slate-l">
            {state.failures.length} agente{state.failures.length > 1 ? 's' : ''} con fallo transitorio (
            {state.failures.map((f) => f.agent).join(', ')}). Confluencia degradada — reintenta para vista completa.
          </div>
        </div>
      )}

      {/* A1 + A2 parallel grid */}
      <SectionLabel>agentes paralelos</SectionLabel>
      <div className="grid grid-cols-2 gap-2 px-4">
        <A1Card status={state.a1Status} data={state.a1} />
        <A2Card status={state.a2Status} data={state.a2} />
      </div>

      {/* Debate (conditional) */}
      {state.debate && (
        <>
          <FlowArrow>↓ anomalía detectada</FlowArrow>
          <SectionLabel>debate A1 × A2</SectionLabel>
          <div className="px-4">
            <DebateCard status={state.debateStatus} data={state.debate} />
          </div>
        </>
      )}

      {/* A3 always visible */}
      <SectionLabel>motor técnico autónomo</SectionLabel>
      <div className="px-4">
        <A3Card status={state.a3Status} data={state.a3} dailyCandles={state.dailyCandles} />
      </div>

      {/* Confluence */}
      <SectionLabel>indicador de confluencia</SectionLabel>
      <div className="px-4">
        <ConfluenceIndicator data={confluence} />
      </div>

      {/* A4 final output */}
      {state.a4 && (
        <>
          <FlowArrow>↓ output al usuario</FlowArrow>
          <SectionLabel>sistema · A4</SectionLabel>
          <div className="px-4">
            <A4Card status={state.a4Status} data={state.a4} aligned={confluence?.aligned ?? false} />
          </div>
        </>
      )}

      {/* Disclaimer */}
      <footer className="px-5 pt-6 text-center font-mono text-[8px] text-slate opacity-60 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}
