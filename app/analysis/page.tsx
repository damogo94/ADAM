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
import { RelatedRadar } from '@/components/analysis/related-radar';
import { Graticule } from '@/components/inicio/decor/graticule';
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
import type { DigestEntry_t, RadarResponse_t } from '@/lib/radar/types';
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
  /** id de la fila persistida (evento `final`) — lo usa el re-narrado con EST. */
  analysisId: string | null;
  error: UserError | null;
  partial: boolean;
  failures: { agent: string; message: string }[];
  dailyCandles: Candle[];
  /** Puente al radar (post-resolve, Fase 1C·C2). null = aún no leído o degradado. */
  related: { count: number; preview: DigestEntry_t[] } | null;
  /** Estado de "Fijar alerta CMT" (post-resolve, Fase 1C·C1). */
  alerta: 'idle' | 'pinning' | 'pinned' | 'error';
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
  analysisId: null,
  error: null,
  partial: false,
  failures: [],
  dailyCandles: [],
  related: null,
  alerta: 'idle',
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
  // Origen "vienes del radar" (B3): ?ticker solo NO basta (se usa para deep-links
  // y onboarding) — el radar marca su navegación con &from=radar.
  const fromRadar = search.get('from') === 'radar';
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

  // Puente al radar (Fase 1C·C2) — se lee SOLO post-resolve (a4 done), con dato
  // REAL del scan persistido. Degrada en SILENCIO si no hay sesión/watchlist (401)
  // o el fetch falla: el puente simplemente no aparece, nunca rompe el análisis.
  // AbortController propio (independiente del run principal).
  useEffect(() => {
    if (state.a4Status !== 'done' || !state.ticker) return;
    const ctrl = new AbortController();
    const current = resolveTicker(state.ticker);
    void (async () => {
      try {
        const r = await fetch('/api/watchlist/radar', { signal: ctrl.signal });
        if (!r.ok) return; // 401/sin watchlist → degrada silencioso
        const data = (await r.json()) as RadarResponse_t;
        const active = data.rows.filter(
          (row) =>
            row.ticker !== current &&
            (row.signal != null ||
              row.latest?.a1_anomaly_detected ||
              row.delta.anomaly_new ||
              row.delta.direction_flipped ||
              row.delta.a3_signal_flipped)
        );
        const preview = data.digest.filter((d) => d.ticker !== current).slice(0, 3);
        setState((s) => (s.ticker === current ? { ...s, related: { count: active.length, preview } } : s));
      } catch {
        /* degrada: el puente al radar no se muestra */
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.a4Status, state.ticker]);

  /**
   * Re-narra A4 server-side con la pata de Estructura (4 patas) y/o un A2
   * tardío, y persiste la fila vía analysisId. Best-effort: si falla, se
   * conserva el A4 anterior. Unifica el cierre del run y el toggle de EST.
   */
  async function reconsolidateA4(params: {
    ticker: string;
    a1: A1Output | null;
    a2: A2Output | null;
    a3: A3Output | null;
    debate: DebateOutput | null;
    estructura: EstructuraOutput_t | null;
    analysisId: string | null;
    signal?: AbortSignal;
  }): Promise<void> {
    try {
      const r = await fetch('/api/agents/a4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: params.ticker,
          a1: params.a1,
          a2: params.a2,
          a3: params.a3,
          debate: params.debate,
          estructura: params.estructura,
          analysisId: params.analysisId ?? undefined,
        }),
        signal: params.signal,
      });
      if (!r.ok) return;
      const cj = (await r.json()) as { a4?: A4Output };
      if (cj.a4) setState((s) => ({ ...s, a4: cj.a4! }));
    } catch {
      /* best-effort: conservamos el A4 anterior */
    }
  }

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
            analysisId: acc.analysisId,
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

      // Cierre: incorpora el A2 tardío (caché fría) y/o la pata de Estructura
      // (opt-in). Ambos alimentan UNA sola re-consolidación de A4 server-side
      // (que además persiste la fila: A2, confluencia a 4 patas, estructura_output).
      let a2Final = acc.a2;
      if (!acc.a2) {
        a2Final = await a2Promise;
        if (ctrl.signal.aborted) return;
        if (a2Final) {
          const a2v = a2Final; // narrowing estable dentro del closure de setState
          setState((s) => ({
            ...s,
            a2: a2v,
            a2Status: a2v.opportunity_detected ? 'anomaly' : 'done',
          }));
        } else {
          setState((s) => ({ ...s, a2Status: 'error' }));
        }
      }

      // EST: si el usuario la activó, espera su lambda paralelo. El ref evita
      // sumarla si la apagó mientras corría.
      const estFinal = estEnabled && estEnabledRef.current ? await estPromise : null;
      if (ctrl.signal.aborted) return;

      // Re-consolida solo si hay algo nuevo respecto al A4 horneado en /run:
      // un A2 que llegó tarde, o la pata de Estructura.
      const a2WasLate = !acc.a2 && !!a2Final;
      if (a2WasLate || estFinal) {
        await reconsolidateA4({
          ticker,
          a1: acc.a1,
          a2: a2Final,
          a3: acc.a3,
          debate: acc.debate,
          estructura: estFinal,
          analysisId: acc.analysisId,
          signal: ctrl.signal,
        });
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
        // Suma la pata a A4: re-narra a 4 patas (la cita) y persiste la fila
        // (estructura_output + confluencia 4 patas). Si no hubo análisis previo
        // (sin analysisId) igual re-narra la tarjeta, best-effort.
        if (est && state.ticker === current) {
          void reconsolidateA4({
            ticker: current,
            a1: state.a1,
            a2: state.a2,
            a3: state.a3,
            debate: state.debate,
            estructura: est,
            analysisId: state.analysisId,
          });
        }
      });
    }
  }

  /**
   * "Fijar alerta CMT" (Fase 1C·C1): añade el ticker al radar/watchlist para que el
   * scanner CMT (cron determinista) lo vigile. NO es directiva de compra/venta —
   * acción de producto. 409 (ya estaba) se trata como éxito idempotente.
   */
  async function fijarAlerta() {
    if (!state.ticker || state.alerta === 'pinning' || state.alerta === 'pinned') return;
    setState((s) => ({ ...s, alerta: 'pinning' }));
    try {
      const r = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: state.ticker,
          asset_type: isCryptoTicker(state.ticker) ? 'crypto' : 'equity',
        }),
      });
      setState((s) => ({ ...s, alerta: r.ok || r.status === 409 ? 'pinned' : 'error' }));
    } catch {
      setState((s) => ({ ...s, alerta: 'error' }));
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

      {/* Breadcrumb de origen (Fase 1B·B3) — solo si vienes del radar (&from=radar). */}
      {fromRadar && (
        <div className="mx-4 mt-2 font-mono text-fluid-micro">
          <Link
            href="/watchlist"
            className="inline-flex items-center gap-1 text-ink/45 underline-offset-2 transition-colors hover:text-ink/75 hover:underline"
          >
            ← vienes del radar
          </Link>
        </div>
      )}

      <AssetInput onSubmit={handleRun} disabled={isLoading} />

      {/* Agente de Estructura (futuros · MTF) — toggle opt-in para SUMAR la pata
          a la confluencia con un clic, + acceso a la pantalla dedicada. */}
      <div className="mx-4 mt-2 flex flex-wrap items-center justify-end gap-2 font-mono text-fluid-micro">
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

      {/* CTAs post-resolve (Fase 1C·C1) — acción de producto, NUNCA directiva
          compra/vende. Fijar alerta = sumar al radar (lo vigila el scanner CMT). */}
      {state.a4Status === 'done' && state.ticker && (
        <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 font-mono text-fluid-micro">
          <button
            type="button"
            onClick={fijarAlerta}
            disabled={state.alerta === 'pinning' || state.alerta === 'pinned'}
            aria-label="Fijar alerta CMT: añadir al radar para que el scanner lo vigile"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
              state.alerta === 'pinned'
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-white/20 text-white/70 hover:border-white/35 hover:text-white disabled:opacity-50'
            )}
          >
            {state.alerta === 'pinned'
              ? '✓ En tu radar'
              : state.alerta === 'pinning'
                ? 'Fijando…'
                : state.alerta === 'error'
                  ? 'Reintentar alerta'
                  : '+ Fijar alerta CMT'}
          </button>

          {!estEnabled && (
            <button
              type="button"
              onClick={toggleEstructura}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/20 px-2.5 py-1 text-white/70 transition-colors hover:border-white/35 hover:text-white"
            >
              + Sumar Estructura
            </button>
          )}

          <button
            type="button"
            onClick={() => state.ticker && void handleRun(state.ticker)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
          >
            ↻ Re-analizar
          </button>
        </div>
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
              'font-sans text-fluid-caption font-bold tracking-wider mb-0.5',
              state.error.tone === 'auth' && 'text-white/75',
              state.error.tone === 'transient' && 'text-white/80',
              state.error.tone === 'rate_limit' && 'text-white/85',
              state.error.tone === 'partial' && 'text-white/80',
              state.error.tone === 'fatal' && 'text-white'
            )}
          >
            {state.error.title}
          </div>
          <div className="font-mono text-fluid-caption leading-snug text-white/85">{state.error.message}</div>
        </div>
      )}

      {state.partial && state.failures.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-white/20 bg-white/[0.05] px-3 py-2">
          <div className="font-sans text-fluid-caption font-bold tracking-wider text-white/80 mb-0.5">
            ANÁLISIS PARCIAL
          </div>
          <div className="font-mono text-fluid-caption leading-snug text-white/70">
            {state.failures.length} agente{state.failures.length > 1 ? 's' : ''} con fallo transitorio (
            {state.failures.map((f) => f.agent).join(', ')}). Confluencia degradada — reintenta para vista completa.
          </div>
        </div>
      )}

      {/* Hero de confluencia — PERSISTE de submit a resolve (Fase 1A · D1=A2):
          el núcleo CONSOLIDA durante el running y RESUELVE EN SITIO en una síntesis
          clara y GENERAL (dir + accionable + κ + conclusión de A4) al cerrar A4 —
          el cerebro y los agentes ya no desaparecen. Oculto solo en idle y error
          fatal (la caja de error manda). VerdictBar (sticky, glance) y A4 card
          (desglose) coexisten; la cifra accionable es única en las tres piezas. */}
      {state.ticker !== null && !state.error && (
        <ConfluenceHero
          running={isLoading}
          resolved={state.a4Status === 'done'}
          statuses={{ a1: state.a1Status, a2: state.a2Status, a3: state.a3Status }}
          estructuraStatus={estEnabled ? state.estructuraStatus : undefined}
          a4={state.a4}
          confluence={confluence}
          debateStatus={state.debateStatus}
          a1={state.a1}
          a2={state.a2}
          a3={state.a3}
          estructura={state.estructura}
        />
      )}

      {/* Onboarding — solo en idle (sin análisis, sin error). Rellena el hueco. */}
      {isIdle && <OnboardingCard />}

      {/* Desktop: 2 columnas — agentes (8) | rail de síntesis (4). Móvil: stack.
          En idle se oculta: el grid vacío en standby es ruido — el onboarding ya
          explica el sistema. Aparece al lanzar un ticker. */}
      <div className={cn('lg:grid lg:grid-cols-12 lg:gap-2 lg:items-start', isIdle && '!hidden')}>
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
                  confluencePct={confluence?.actionable_pct ?? confluence?.total_pct}
                />
              </div>
            </>
          )}

          {/* Puente al radar (Fase 1C·C2) — post-resolve, dato real. Degrada
              silencioso (no se monta) si no hay sesión/watchlist o el fetch falla. */}
          {state.a4Status === 'done' && state.related && (
            <div className="px-4 pt-3">
              <RelatedRadar count={state.related.count} preview={state.related.preview} />
            </div>
          )}
        </aside>
      </div>

      {/* Disclaimer */}
      <footer className="px-5 pt-6 text-center font-mono text-fluid-caption text-white/66 leading-relaxed">
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
    <section className="relative mx-4 mt-3 overflow-hidden rounded-card border border-ink/10 bg-gradient-to-b from-surface to-void px-5 py-5 shadow-e2 sm:mx-auto sm:max-w-[880px]">
      <Graticule className="opacity-70" />

      {/* Cabecera-instrumento: identidad + dial en reposo (estilo /inicio). */}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-ink/58 before:h-px before:w-[18px] before:bg-accent/80 before:content-['']">
            instrumento · en espera
          </p>
          <p className="mt-3 max-w-md text-fluid-lead leading-[1.5] text-ink/72">
            Escribe un ticker y los cinco agentes lo analizan en paralelo. El núcleo se calibra al lanzar.
          </p>
        </div>

        {/* Dial en reposo — aro + umbrales 34/67 apagados + "—". Sin dato aún. */}
        <div className="relative hidden shrink-0 sm:block" aria-hidden="true">
          <svg viewBox="0 0 104 104" width="84" height="84">
            <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(245,245,247,.10)" strokeWidth="6" />
            <line x1="85.8" y1="73.4" x2="92.5" y2="77.7" stroke="rgba(245,245,247,.20)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="17" y1="71.3" x2="9.9" y2="75.1" stroke="rgba(245,245,247,.20)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-2xl font-semibold leading-none text-ink/45">—</span>
            <span className="mt-[3px] font-mono text-[0.56rem] uppercase tracking-[0.12em] text-ink/35">en espera</span>
          </div>
        </div>
      </div>

      {/* Cómo funciona — pasos 01/02/03 */}
      <div className="relative mt-5 border-t border-ink/8 pt-4">
        <p className="mb-3 inline-flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-ink/45 before:h-px before:w-[14px] before:bg-ink/25 before:content-['']">
          cómo funciona
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-[14px] border border-ink/8 bg-ink/[0.015] px-4 py-3.5 transition-colors hover:border-ink/15"
            >
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="font-mono text-fluid-label font-semibold text-accent">0{s.n}</span>
                <span className="font-sans text-fluid-label font-semibold text-ink">{s.t}</span>
              </div>
              <p className="font-mono text-fluid-caption leading-snug text-ink/58">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
