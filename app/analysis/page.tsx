'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';
import { AssetInput } from '@/components/asset-input';
import { SectionLabel, FlowArrow } from '@/components/section-label';
import { ConfluenceHero } from '@/components/analysis/confluence-hero';
import { A1Card } from '@/components/agents/a1-card';
import { A2Card } from '@/components/agents/a2-card';
import { A3Card } from '@/components/agents/a3-card';
import { DebateCard } from '@/components/agents/debate-card';
import { A4Card } from '@/components/agents/a4-card';
import { EstructuraCard } from '@/components/agents/estructura-card';
import { ConfluenceIndicator } from '@/components/confluence-indicator';
import { VerdictBar } from '@/components/verdict-bar';
import { computeConfluence, type ConfluenceResult } from '@/lib/confluence';
import { resolveError, networkError, type UserError } from '@/lib/errors';
import { resolveTicker } from '@/lib/catalog/assets';
import { isCryptoTicker } from '@/lib/market/crypto-registry';
import { cn, getCurrencyFromTicker } from '@/lib/utils';
import type {
  A1Output_t as A1Output,
  A2Output_t as A2Output,
  A4Output_t as A4Output,
} from '@/agents/shared/types';
import type { A3Output } from '@/agents/a3/schema';
import type { EstructuraOutput_t } from '@/agents/estructura/schema';
import type { DebateOutput } from '@/agents/debate/schema';
import type { AgentStatus } from '@/components/agent-card-shell';

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

/** Eventos NDJSON que emite /api/agents/run (streaming). */
type StreamEvent =
  | { type: 'agent'; agent: 'a1' | 'a2' | 'a3'; status: AgentStatus; data: unknown }
  | { type: 'debate'; status: 'done' | 'skipped'; data: unknown }
  | {
      type: 'final';
      analysis_id?: string | null;
      a4: A4Output;
      partial?: boolean;
      failures?: { agent: string; message: string }[];
      chart_data?: { daily: Candle[] };
    }
  | { type: 'fatal'; error: string; detail?: string; failures?: { agent: string; message: string }[] };

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
  estructura: EstructuraOutput_t | null;
  estructuraStatus: AgentStatus;
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
  estructura: null,
  estructuraStatus: 'idle',
  error: null,
  partial: false,
  failures: [],
  dailyCandles: [],
};

/**
 * Fetch aislado del Agente de Estructura (futuros · MTF). Mismo contrato que
 * /api/agents/a2 standalone: degrada a null en cualquier fallo (la pata es
 * opt-in, nunca debe romper el análisis principal).
 */
async function fetchEstructura(
  ticker: string,
  signal?: AbortSignal
): Promise<EstructuraOutput_t | null> {
  try {
    const r = await fetch('/api/agents/estructura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal,
    });
    if (!r.ok) return null;
    return (await r.json()) as EstructuraOutput_t;
  } catch {
    return null;
  }
}

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

  // Agente de Estructura (futuros · MTF) — opt-in del usuario. Preferencia de
  // sesión (persiste entre runs), por eso vive fuera de RunState. El ref espeja
  // el flag para que una resolución tardía no re-añada la pata tras apagarla.
  const [estEnabled, setEstEnabled] = useState(false);
  const estEnabledRef = useRef(false);

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
      estructuraStatus: estEnabled ? 'scanning' : 'idle',
    });

    // ── Fetch paralelo /api/agents/estructura (opt-in) ─────────────────────
    // Se dispara YA, en paralelo a /run y /a2, con su propio lambda de 60s.
    // Degrada a null sin romper el run principal.
    const estPromise = estEnabled ? fetchEstructura(ticker, ctrl.signal) : Promise.resolve(null);

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

      // Errores PRE-stream (gates, market data) siguen siendo JSON con status.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
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
          estructuraStatus: estEnabled ? 'error' : 'idle',
          error: userErr,
          partial: false,
          failures: (data as { failures?: { agent: string; message: string }[] }).failures ?? [],
        }));
        return;
      }

      // EST (opt-in): se resuelve independiente de /run (su propio fetch).
      if (estEnabled) {
        void estPromise.then((est) => {
          if (ctrl.signal.aborted || !estEnabledRef.current) return;
          setState((s) => ({ ...s, estructura: est, estructuraStatus: est ? 'done' : 'error' }));
        });
      }

      // ── Lectura del stream NDJSON: cada card flipea en su evento real ──────
      // Acumulador para el cierre (re-narrate A4 + persistencia del A2 tardío).
      const acc: {
        a1: A1Output | null;
        a2: A2Output | null;
        a3: A3Output | null;
        debate: DebateOutput | null;
        analysisId: string | null;
      } = { a1: null, a2: null, a3: null, debate: null, analysisId: null };
      let fatal = false;

      const applyEvent = (ev: StreamEvent) => {
        if (ev.type === 'agent') {
          if (ev.agent === 'a1') {
            acc.a1 = ev.data as A1Output | null;
            setState((s) => ({ ...s, a1: acc.a1, a1Status: ev.status }));
          } else if (ev.agent === 'a3') {
            acc.a3 = ev.data as A3Output | null;
            setState((s) => ({ ...s, a3: acc.a3, a3Status: ev.status }));
          } else if (ev.agent === 'a2') {
            acc.a2 = ev.data as A2Output | null;
            setState((s) => ({ ...s, a2: acc.a2, a2Status: ev.status }));
          }
        } else if (ev.type === 'debate') {
          acc.debate = ev.data as DebateOutput | null;
          setState((s) => ({ ...s, debate: acc.debate, debateStatus: acc.debate ? 'done' : 'idle' }));
        } else if (ev.type === 'final') {
          acc.analysisId = ev.analysis_id ?? null;
          setState((s) => ({
            ...s,
            a4: ev.a4,
            a4Status: 'done',
            // Si algún evento de agente se perdió, no dejes su card en scanning.
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
          }));
        } else if (ev.type === 'fatal') {
          fatal = true;
          const userErr = resolveError({ error: ev.error, detail: ev.detail, failures: ev.failures });
          setState((s) => ({
            ...s,
            a1Status: 'error',
            a2Status: 'error',
            a3Status: 'error',
            a4Status: 'error',
            error: userErr,
            partial: false,
            failures: ev.failures ?? [],
          }));
        }
      };

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (ctrl.signal.aborted) return;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            applyEvent(JSON.parse(line) as StreamEvent);
          } catch {
            /* línea parcial o no-JSON: la ignoramos */
          }
        }
      }
      if (buffer.trim()) {
        try {
          applyEvent(JSON.parse(buffer) as StreamEvent);
        } catch {
          /* noop */
        }
      }

      if (fatal || ctrl.signal.aborted) return;

      // A2 standalone: si el stream no trajo A2 (caché fría), la llena su lambda
      // paralelo. Igual que antes, re-narramos A4 con A1+A2+A3 completos.
      if (!acc.a2) {
        const a2Standalone = await a2Promise;
        if (ctrl.signal.aborted) return;
        if (a2Standalone) {
          setState((s) => ({
            ...s,
            a2: a2Standalone,
            a2Status: a2Standalone.opportunity_detected ? 'anomaly' : 'done',
          }));
          try {
            const consRes = await fetch('/api/agents/a4', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticker,
                a1: acc.a1,
                a2: a2Standalone,
                a3: acc.a3,
                debate: acc.debate,
                analysisId: acc.analysisId ?? undefined,
              }),
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

  /**
   * Toggle del Agente de Estructura. "Un clic": si ya hay un ticker analizado,
   * añade la pata EN VIVO (fetch aislado de EST para ese ticker) sin re-correr
   * el resto. Apagarlo limpia la pata al instante.
   */
  function toggleEstructura() {
    const next = !estEnabled;
    setEstEnabled(next);
    estEnabledRef.current = next;

    if (!next) {
      setState((s) => ({ ...s, estructura: null, estructuraStatus: 'idle' }));
      return;
    }

    const current = state.ticker;
    if (current && !state.estructura) {
      setState((s) => ({ ...s, estructuraStatus: 'scanning' }));
      void fetchEstructura(current).then((est) => {
        if (!estEnabledRef.current) return;
        setState((s) =>
          s.ticker === current
            ? { ...s, estructura: est, estructuraStatus: est ? 'done' : 'error' }
            : s
        );
      });
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
    state.a3 || state.a1 || state.estructura
      ? computeConfluence(state.a1, state.a2, state.a3, state.debate, state.estructura)
      : null;

  // Idle = aún no se ha lanzado ningún análisis y no hay error → onboarding.
  const isIdle = state.ticker === null && !state.error;

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-3xl lg:max-w-6xl xl:max-w-7xl">
      <Header status={headerStatus} />

      <AssetInput onSubmit={handleRun} disabled={isLoading} />

      {/* Agente de Estructura (futuros · MTF) — toggle opt-in para SUMAR la pata
          a la confluencia con un clic, + acceso a la pantalla dedicada. */}
      <div className="mx-4 mt-2 flex flex-wrap items-center justify-end gap-2 font-mono text-[11px]">
        <button
          type="button"
          onClick={toggleEstructura}
          aria-pressed={estEnabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
            estEnabled
              ? 'border-accent/60 bg-accent/10 text-accent'
              : 'border-dashed border-white/20 text-white/55 hover:border-white/35 hover:text-white/80'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors',
              estEnabled ? 'bg-accent' : 'bg-white/30'
            )}
          />
          {estEnabled ? 'Estructura activa · futuros MTF' : '+ Sumar Estructura · futuros MTF'}
        </button>
        <Link
          href="/estructura"
          className="text-white/45 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
        >
          pantalla dedicada →
        </Link>
      </div>

      {/* Barra de veredicto — lo primero que ve el usuario en cuanto A4 está listo. */}
      {state.a4 && state.a4Status === 'done' && (
        <VerdictBar a4={state.a4} confluence={confluence} aligned={confluence?.aligned ?? false} />
      )}

      {state.error && (
        <div
          className={cn(
            'mx-4 mt-3 rounded-lg border px-3 py-2.5 transition-all',
            // Errores = chrome → severidad por INTENSIDAD de blanco, no por
            // color de mercado (emerald/rose/amber reservados a datos).
            state.error.tone === 'auth' && 'border-white/15 bg-white/[0.03]',
            state.error.tone === 'transient' && 'border-white/20 bg-white/[0.05]',
            state.error.tone === 'rate_limit' && 'border-white/25 bg-white/[0.06]',
            state.error.tone === 'partial' && 'border-white/20 bg-white/[0.05]',
            state.error.tone === 'fatal' && 'border-white/40 bg-white/[0.10] animate-blink-slow'
          )}
        >
          <div
            className={cn(
              'font-sans text-[12px] font-bold tracking-wider mb-0.5',
              state.error.tone === 'auth' && 'text-white/75',
              state.error.tone === 'transient' && 'text-white/80',
              state.error.tone === 'rate_limit' && 'text-white/85',
              state.error.tone === 'partial' && 'text-white/80',
              state.error.tone === 'fatal' && 'text-white'
            )}
          >
            {state.error.title}
          </div>
          <div className="font-mono text-[12px] leading-snug text-white/85">{state.error.message}</div>
        </div>
      )}

      {state.partial && state.failures.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-white/20 bg-white/[0.05] px-3 py-2">
          <div className="font-sans text-[12px] font-bold tracking-wider text-white/80 mb-0.5">
            ANÁLISIS PARCIAL
          </div>
          <div className="font-mono text-[12px] leading-snug text-white/70">
            {state.failures.length} agente{state.failures.length > 1 ? 's' : ''} con fallo transitorio (
            {state.failures.map((f) => f.agent).join(', ')}). Confluencia degradada — reintenta para vista completa.
          </div>
        </div>
      )}

      {/* Hero de confluencia — el "momento running": tres corrientes ambientales
          hacia un núcleo que resuelve en el veredicto. Visible desde submit hasta
          done; oculto en idle y cuando hay error fatal (la caja de error manda). */}
      {state.ticker !== null && !state.error && (
        <ConfluenceHero
          running={isLoading}
          resolved={state.a4Status === 'done'}
          statuses={{ a1: state.a1Status, a2: state.a2Status, a3: state.a3Status }}
          estructuraStatus={estEnabled ? state.estructuraStatus : undefined}
          a4={state.a4}
          confluence={confluence}
        />
      )}

      {/* Onboarding — solo en idle (sin análisis, sin error). Rellena el hueco. */}
      {isIdle && <OnboardingCard />}

      {/* Desktop: 2 columnas — agentes (8) | rail de síntesis (4). Móvil: stack. */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-2 lg:items-start">
        {/* Columna principal: agentes */}
        <div className="lg:col-span-8">
          {/* A1 + A2 parallel grid */}
          <SectionLabel>agentes paralelos</SectionLabel>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 px-4">
            <A1Card
              status={state.a1Status}
              data={state.a1}
              isCrypto={isCryptoTicker(state.ticker ?? '')}
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

          {/* Estructura (opt-in) — 4ª pata, también aislada (futuros · MTF). */}
          {estEnabled && (
            <>
              <FlowArrow>↓ estructura · futuros (MTF)</FlowArrow>
              <SectionLabel>agente de estructura · aislado</SectionLabel>
              <div className="px-4">
                <EstructuraCard
                  status={state.estructuraStatus}
                  data={state.estructura}
                  ticker={state.ticker}
                />
              </div>
            </>
          )}
        </div>

        {/* Rail de síntesis: confluencia + A4. En lg sube arriba a la derecha
            (sticky) en vez de quedar al final del scroll. */}
        <aside className="lg:col-span-4 lg:sticky lg:top-3">
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
                <A4Card
                  status={state.a4Status}
                  data={state.a4}
                  aligned={confluence?.aligned ?? false}
                  confluencePct={confluence?.total_pct}
                />
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Disclaimer */}
      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-white/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

/**
 * Onboarding — se muestra SOLO en idle (sin análisis lanzado, sin error).
 * Rellena el hueco vacío de la pantalla en desktop y explica el flujo en
 * 3 pasos sin jerga ni color decorativo (terminal B&W puro).
 */
function OnboardingCard() {
  const steps: { n: string; t: string; d: string }[] = [
    { n: '1', t: 'Escribe un ticker', d: 'AAPL · BTC · OIL — o elígelo del catálogo ⊞' },
    {
      n: '2',
      t: 'Los agentes lo analizan',
      d: '5 agentes en paralelo — micro · macro · técnico aislado · síntesis',
    },
    {
      n: '3',
      t: 'Lees el veredicto',
      d: 'dirección + confianza consolidadas, con la confluencia entre agentes',
    },
  ];

  return (
    <section className="mx-4 mt-3 overflow-hidden rounded-[18px] border border-white/8 bg-surface-2 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-sans text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
          cómo funciona
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="flex gap-2.5 rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2.5"
          >
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/15 font-sans text-[12px] font-bold text-white/80">
              {s.n}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[12px] font-medium leading-tight text-white/85">{s.t}</div>
              <div className="mt-0.5 font-mono text-[11px] leading-snug text-white/66">{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
