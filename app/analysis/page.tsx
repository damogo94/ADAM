'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
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
import { resolveTicker } from '@/lib/catalog/assets';
import { cn, getCurrencyFromTicker } from '@/lib/utils';
import type {
  A1Output_t as A1Output,
  A2Output_t as A2Output,
  A4Output_t as A4Output,
} from '@/agents/shared/types';
import type { A3Output } from '@/agents/a3/schema';
import type { DebateOutput } from '@/agents/debate/schema';
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
  return (
    <Suspense fallback={<div className="min-h-screen bg-void" />}>
      <AnalysisInner />
    </Suspense>
  );
}

function AnalysisInner() {
  const [state, setState] = useState<RunState>(INITIAL);
  const search = useSearchParams();
  const router = useRouter();
  const autoTicker = search.get('ticker');
  const autoRanRef = useRef<string | null>(null);
  // AbortController para cancelar la request anterior si el user lanza otra rápida.
  // Sin esto, las respuestas race y la última en llegar (potencialmente vieja)
  // clobbers el estado del análisis en curso.
  const abortRef = useRef<AbortController | null>(null);

  // Auto-trigger cuando viene desde /watchlist con ?ticker=X
  useEffect(() => {
    if (autoTicker && autoRanRef.current !== autoTicker) {
      autoRanRef.current = autoTicker;
      void handleRun(autoTicker.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTicker]);

  async function handleRun(rawTicker: string) {
    // Cancela cualquier request anterior en vuelo
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Defense in depth: resuelve aliases ("GOLD" → "XAU/USD") en todos los
    // entry-points (input libre, ?ticker=X desde watchlist, deep-link).
    const ticker = resolveTicker(rawTicker);

    setState({
      ...INITIAL,
      ticker,
      a1Status: 'scanning',
      a2Status: 'scanning',
      a3Status: 'scanning',
    });

    // ── Fetch principal /api/agents/run (A1+A3+Debate+A4) ───────────
    // A2 sale del pipeline (architectural decision 2026-05-21). El run
    // devuelve A2 desde cache si lo hay; si no, A2 viene null y se
    // rellena por el fetch paralelo de /api/agents/a2.
    const runPromise = fetch('/api/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal: ctrl.signal,
    });

    // ── Fetch paralelo /api/agents/a2 (A2 con su propio lambda de 60s) ─
    // Se dispara YA, no esperamos a /run. Su 60s budget esta dedicado
    // exclusivamente a A2, por lo que el Sonnet de A2 puede tomarse su
    // tiempo sin riesgo de 504. Persiste la cache; runs siguientes del
    // mismo ticker leeran A2 instant via /run.
    const a2Promise = fetch('/api/agents/a2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const j = (await r.json()) as { a2?: A2Output };
        return j.a2 ?? null;
      })
      .catch(() => null);

    try {
      const res = await runPromise;
      if (ctrl.signal.aborted) return;
      const data = await res.json();
      if (ctrl.signal.aborted) return;

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

      // Render inicial con lo que vino del pipeline. A2 puede llegar null
      // si era primera petición del ticker (cache vacia) — luego lo updateo
      // cuando termine a2Promise.
      setState({
        ticker,
        a1Status: !a1 ? 'error' : a1.anomaly_detected ? 'anomaly' : 'done',
        a2Status: a2
          ? a2.opportunity_detected
            ? 'anomaly'
            : 'done'
          : 'scanning', // A2 aun en vuelo (standalone)
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

      // Si A2 venia del cache, no esperamos al standalone (el resultado
      // standalone seria identico o redundante).
      if (!a2) {
        // Espera al fetch paralelo y actualiza la card de A2.
        const a2Standalone = await a2Promise;
        if (ctrl.signal.aborted) return;
        if (a2Standalone) {
          setState((s) => ({
            ...s,
            a2: a2Standalone,
            a2Status: a2Standalone.opportunity_detected ? 'anomaly' : 'done',
          }));

          // A4 (y su caja de A2) se horneó en /run con a2=null. Ahora que A2
          // llegó, re-narramos A4 con A1+A2+A3 completos para que su narrativa
          // y la confluencia que muestra sean coherentes. Best-effort: si falla
          // o se aborta, dejamos el A4 anterior (la confluencia del indicador ya
          // se recalcula en cliente con el A2 nuevo).
          try {
            const consRes = await fetch('/api/agents/a4', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker, a1, a2: a2Standalone, a3, debate }),
              signal: ctrl.signal,
            });
            if (ctrl.signal.aborted) return;
            if (consRes.ok) {
              const cj = (await consRes.json()) as { a4?: A4Output };
              if (cj.a4) setState((s) => ({ ...s, a4: cj.a4! }));
            }
          } catch {
            /* best-effort: conservamos el A4 anterior */
          }
        } else {
          // Si el standalone tambien fallo, marca como error
          setState((s) => ({ ...s, a2Status: 'error' }));
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) return; // AbortError esperado, no es fallo
      if (e instanceof DOMException && e.name === 'AbortError') return;
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
            // Color semántico por tono (sesión 5b):
            // auth=blanco dim, transient/rate_limit=amber, partial=amber, fatal=rose pulse
            state.error.tone === 'auth' && 'border-white/15 bg-white/[0.03]',
            state.error.tone === 'transient' && 'border-amber/30 bg-amber/[0.06]',
            state.error.tone === 'rate_limit' && 'border-amber/35 bg-amber/[0.07]',
            state.error.tone === 'partial' && 'border-amber/30 bg-amber/[0.06]',
            state.error.tone === 'fatal' && 'border-rose/40 bg-rose/[0.08] animate-urg-pulse'
          )}
        >
          <div
            className={cn(
              'font-orbitron text-[10px] font-bold tracking-wider mb-0.5',
              state.error.tone === 'auth' && 'text-white/75',
              state.error.tone === 'transient' && 'text-amber',
              state.error.tone === 'rate_limit' && 'text-amber',
              state.error.tone === 'partial' && 'text-amber',
              state.error.tone === 'fatal' && 'text-rose'
            )}
          >
            {state.error.title}
          </div>
          <div className="font-mono text-[10px] leading-snug text-white/85">{state.error.message}</div>
        </div>
      )}

      {state.partial && state.failures.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-amber/30 bg-amber/[0.06] px-3 py-2">
          <div className="font-orbitron text-[10px] font-bold tracking-wider text-amber mb-0.5">
            ANÁLISIS PARCIAL
          </div>
          <div className="font-mono text-[10px] leading-snug text-white/70">
            {state.failures.length} agente{state.failures.length > 1 ? 's' : ''} con fallo transitorio (
            {state.failures.map((f) => f.agent).join(', ')}). Confluencia degradada — reintenta para vista completa.
          </div>
        </div>
      )}

      {/* A1 + A2 parallel grid */}
      <SectionLabel>agentes paralelos</SectionLabel>
      <div className="grid grid-cols-2 gap-2 px-4">
        <A1Card
          status={state.a1Status}
          data={state.a1}
          failureMessage={state.failures.find((f) => f.agent === 'A1')?.message}
        />
        <A2Card
          status={state.a2Status}
          data={state.a2}
          failureMessage={state.failures.find((f) => f.agent === 'A2')?.message}
        />
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
        <A3Card
          status={state.a3Status}
          data={state.a3}
          dailyCandles={state.dailyCandles}
          currency={state.a1?.price?.currency ?? getCurrencyFromTicker(state.ticker ?? '')}
          failureMessage={state.failures.find((f) => f.agent === 'A3')?.message}
        />
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
