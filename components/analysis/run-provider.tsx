'use client';

import { createContext, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveError, networkError } from '@/lib/errors';
import { resolveTicker } from '@/lib/catalog/assets';
import { isCryptoTicker } from '@/lib/market/crypto-registry';
import { computeConfluence, type ConfluenceResult } from '@/lib/confluence';
import { applyRunEvent } from '@/lib/run/apply-event';
import { INITIAL, type RunState, type StreamEvent } from '@/lib/run/types';
import type {
  A1Output_t as A1Output,
  A2Output_t as A2Output,
  A4Output_t as A4Output,
} from '@/agents/shared/types';
import type { A3Output } from '@/agents/a3/schema';
import type { EstructuraOutput_t } from '@/agents/estructura/schema';
import type { DebateOutput } from '@/agents/debate/schema';

/**
 * RunProvider — el ESTADO del run de /analysis, elevado a un contexto que vive en
 * el layout del route-group (workspace). Al no remontarse el layout en soft-nav,
 * el análisis PERSISTE al ir al radar y volver (B1·F1). La page es un consumidor
 * vía `useRun()`.
 *
 * Sólo capa de estado/cliente: pipeline, stream NDJSON y aislamiento A3/EST
 * intactos. La transición de estado va por el reductor PURO (lib/run, testeado);
 * el AbortController versiona los runs (un run nuevo aborta el anterior → ningún
 * evento de un run viejo pinta sobre el nuevo, también tras navegar).
 */

/** Fetch aislado del Agente de Estructura (futuros · MTF). Degrada a null. */
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

export interface RunContextValue {
  state: RunState;
  estEnabled: boolean;
  isLoading: boolean;
  confluence: ConfluenceResult | null;
  handleRun: (rawTicker: string) => Promise<void>;
  toggleEstructura: () => void;
  fijarAlerta: () => Promise<void>;
}

const RunContext = createContext<RunContextValue | null>(null);

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error('useRun debe usarse dentro de <RunProvider>');
  return ctx;
}

export function RunProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RunState>(INITIAL);
  const router = useRouter();
  // AbortController para cancelar la request anterior si el user lanza otra rápida.
  const abortRef = useRef<AbortController | null>(null);

  // Agente de Estructura (futuros · MTF) — opt-in del usuario. Preferencia de
  // sesión, por eso vive fuera de RunState. El ref espeja el flag para que una
  // resolución tardía no re-añada la pata tras apagarla.
  const [estEnabled, setEstEnabled] = useState(false);
  const estEnabledRef = useRef(false);

  /**
   * Re-narra A4 server-side con la pata de Estructura (4 patas) y/o un A2 tardío,
   * y persiste la fila vía analysisId. Best-effort: si falla, conserva el A4 anterior.
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
    // Cancela cualquier request anterior en vuelo (versiona el run).
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Defense in depth: resuelve aliases ("GOLD" → "XAU/USD") en todos los entry-points.
    const ticker = resolveTicker(rawTicker);

    setState({
      ...INITIAL,
      ticker,
      a1Status: 'scanning',
      a2Status: 'scanning',
      a3Status: 'scanning',
      estructuraStatus: estEnabled ? 'scanning' : 'idle',
    });

    // ── Fetch paralelo /api/agents/estructura (opt-in) ──────────────────────
    const estPromise = estEnabled ? fetchEstructura(ticker, ctrl.signal) : Promise.resolve(null);

    // ── Fetch principal /api/agents/run (A1+A3+Debate+A4) ───────────────────
    const runPromise = fetch('/api/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
      signal: ctrl.signal,
    });

    // ── Fetch paralelo /api/agents/a2 (su propio lambda de 60s) ─────────────
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

      // ── Lectura del stream NDJSON: cada card flipea en su evento real ────────
      const acc: {
        a1: A1Output | null;
        a2: A2Output | null;
        a3: A3Output | null;
        debate: DebateOutput | null;
        analysisId: string | null;
      } = { a1: null, a2: null, a3: null, debate: null, analysisId: null };
      let fatal = false;

      const applyEvent = (ev: StreamEvent) => {
        // Acumulador para el cierre (reconsolidación A4) + flag fatal: concerns de
        // handleRun. La TRANSICIÓN de estado va al reductor PURO (lib/run, testeado).
        if (ev.type === 'agent') {
          if (ev.agent === 'a1') acc.a1 = ev.data as A1Output | null;
          else if (ev.agent === 'a2') acc.a2 = ev.data as A2Output | null;
          else if (ev.agent === 'a3') acc.a3 = ev.data as A3Output | null;
        } else if (ev.type === 'debate') {
          acc.debate = ev.data as DebateOutput | null;
        } else if (ev.type === 'final') {
          acc.analysisId = ev.analysis_id ?? null;
        } else if (ev.type === 'fatal') {
          fatal = true;
        }
        setState((s) => applyRunEvent(s, ev));
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
      // (opt-in) en UNA sola re-consolidación de A4 server-side (persiste la fila).
      let a2Final = acc.a2;
      if (!acc.a2) {
        a2Final = await a2Promise;
        if (ctrl.signal.aborted) return;
        if (a2Final) {
          const a2v = a2Final;
          setState((s) => ({
            ...s,
            a2: a2v,
            a2Status: a2v.opportunity_detected ? 'anomaly' : 'done',
          }));
        } else {
          setState((s) => ({ ...s, a2Status: 'error' }));
        }
      }

      const estFinal = estEnabled && estEnabledRef.current ? await estPromise : null;
      if (ctrl.signal.aborted) return;

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
      if (ctrl.signal.aborted) return;
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
   * añade la pata EN VIVO sin re-correr el resto. Apagarlo limpia la pata.
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
   * scanner CMT lo vigile. Acción de producto, NUNCA compra/venta. 409 = idempotente.
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

  const confluence: ConfluenceResult | null =
    state.a3 || state.a1 || state.estructura
      ? computeConfluence(state.a1, state.a2, state.a3, state.debate, state.estructura)
      : null;

  const value: RunContextValue = {
    state,
    estEnabled,
    isLoading,
    confluence,
    handleRun,
    toggleEstructura,
    fijarAlerta,
  };

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}
