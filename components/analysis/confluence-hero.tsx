'use client';

import { useEffect, useRef, useState } from 'react';
import type { A4Output_t as A4Output } from '@/agents/shared/types';
import type { ConfluenceResult } from '@/lib/confluence';
import type { AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';

/**
 * ConfluenceHero — la pieza protagonista del momento "running" de /analysis.
 *
 * Encima de las cards (no overlay). Tres corrientes (A1·A2·A3) fluyen hacia un
 * núcleo que se construye durante la espera y RESUELVE en el veredicto al cerrar
 * A4 (entronca con el VerdictBar). Reskin "Instrumento de precisión".
 *
 * INVARIANTE DE HONESTIDAD (línea roja del proyecto):
 *   Ningún estado "completado" precede a su evento real. El hero NUNCA fabrica
 *   un hito por-agente. Entre `submit` y el `resolve` de /run:
 *     - Las tres corrientes fluyen ambientales (es VERDAD: los tres se despachan
 *       en paralelo). NO se marca ninguna como "resuelta" a mitad de vuelo.
 *     - El arco es una ESTIMACIÓN asintótica que jamás llega al 100% hasta el
 *       resolve real (truco iOS/YouTube). Etiquetado como estimación, no "done".
 *   Una corriente solo pasa a "settled" cuando su `AgentStatus` real lo es
 *   (done/anomaly), y a "dim" si es `error`. (A2 puede seguir `scanning` tras el
 *   reveal en caché fría: su corriente sigue viva hasta que su card real cierra.)
 *
 * NO-NEGOCIABLES DE DISEÑO:
 *   - Chrome = `accent`/`ink` (white). JAMÁS emerald/rose/amber (semántica de
 *     mercado = dato). El veredicto vive en el VerdictBar, no aquí.
 *   - Corrientes diferenciadas por TIPOGRAFÍA/POSICIÓN, no por hue.
 *   - A3 aislado: su corriente es independiente; ninguna arista la alimenta de
 *     A1/A2. El divisor punteado lo materializa.
 *   - Reusa keyframes existentes (`animate-sweep`, `animate-blink`); el build-up
 *     y el reveal son transiciones CSS dirigidas por estado (sin keyframe nuevo).
 *   - `prefers-reduced-motion`: variante estática equivalente (end-state directo).
 */

interface StreamCfg {
  key: 'a1' | 'a2' | 'a3' | 'est';
  badge: string;
  label: string;
  /** A3/EST llevan divisor de aislamiento a su izquierda. */
  isolated?: boolean;
}

const STREAMS: StreamCfg[] = [
  { key: 'a1', badge: 'A1', label: 'activos · micro' },
  { key: 'a2', badge: 'A2', label: 'macro' },
  { key: 'a3', badge: 'A3', label: 'técnico · aislado', isolated: true },
];

/** 4ª corriente opcional — Agente de Estructura (futuros · MTF), también aislada. */
const EST_STREAM: StreamCfg = { key: 'est', badge: 'EST', label: 'estructura · MTF', isolated: true };

interface ConfluenceHeroProps {
  /** Algún agente en `scanning` → run en vuelo (espera). */
  running: boolean;
  /** A4 cerró → dispara el reveal. */
  resolved: boolean;
  /** Estados reales por-agente. Solo para atenuar en `error` o mantener viva una
   *  corriente que sigue `scanning`. NUNCA para fabricar un "done". */
  statuses: { a1: AgentStatus; a2: AgentStatus; a3: AgentStatus };
  /** Estado del Agente de Estructura. Solo definido cuando el usuario lo activó
   *  (opt-in) → entonces se pinta la 4ª corriente. undefined → no se muestra. */
  estructuraStatus?: AgentStatus;
  /** Veredicto consolidado (reveal). null mientras corre. */
  a4: A4Output | null;
  /** Confluencia recalculada en cliente; preferida sobre la horneada en A4. */
  confluence: ConfluenceResult | null;
}

/** matchMedia(prefers-reduced-motion) — patrón de reduced-motion compartido. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, []);
  return reduced;
}

/**
 * Progreso ASINTÓTICO contra una estimación de latencia. Desacelera y se satura
 * en ~0.92 — NUNCA llega a 1 hasta que `resolved` es verdad. Rápido → salta a
 * listo antes; lento → sigue "trabajando" sin mentir sobre estar terminado.
 *
 * τ=26s: ~0.66 a los 28s (p50 típico), ~0.86 a los 52s (p95). Constante tuneable;
 * no es un % real de trabajo, es una curva de espera honesta por construcción.
 */
function useAsymptoticProgress(active: boolean, resolved: boolean, reduced: boolean): number {
  const [p, setP] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (resolved) {
      setP(1);
      return;
    }
    if (!active) {
      setP(0);
      startRef.current = null;
      return;
    }
    if (reduced) {
      // Estático: estado indeterminado a medio camino, sin timer.
      setP(0.5);
      return;
    }
    startRef.current = Date.now();
    const id = window.setInterval(() => {
      const t = (Date.now() - (startRef.current ?? Date.now())) / 1000;
      setP(Math.min(0.92, 1 - Math.exp(-t / 26)));
    }, 120);
    return () => window.clearInterval(id);
  }, [active, resolved, reduced]);
  return p;
}

type StreamVisual = 'flowing' | 'settled' | 'dim';

function streamVisual(status: AgentStatus): StreamVisual {
  if (status === 'error') return 'dim';
  // `scanning` cubre tanto la espera como una corriente que sigue viva tras el
  // reveal (p.ej. A2 en caché fría). done/anomaly → asentada.
  if (status === 'scanning') return 'flowing';
  return 'settled';
}

function Stream({ cfg, status, reduced, delay }: { cfg: StreamCfg; status: AgentStatus; reduced: boolean; delay: string }) {
  const v = streamVisual(status);
  return (
    <div className={cn('relative flex-1 text-center', cfg.isolated && 'border-l border-dashed border-white/15 pl-2')}>
      {cfg.isolated && (
        <span className="absolute -top-px left-2 font-mono text-[11px] uppercase tracking-wider text-white/30">
          aislado
        </span>
      )}
      <span
        className={cn(
          'font-sans text-[12px] font-bold tracking-wider rounded px-1.5 py-0.5',
          v === 'dim' ? 'bg-white/[0.04] text-white/40' : 'bg-white/[0.08] text-white'
        )}
      >
        {cfg.badge}
      </span>
      <div className={cn('mt-1 font-mono text-[11px]', v === 'dim' ? 'text-white/35' : 'text-white/66')}>
        {v === 'dim' ? 'sin señal' : cfg.label}
      </div>
      {/* Carril de la corriente — diferenciada por POSICIÓN, no por color. */}
      <div className="relative mx-auto mt-2 h-[46px] w-px bg-white/12">
        {v === 'flowing' && !reduced && (
          <span
            className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent animate-sweep"
            style={{ animationDelay: delay }}
          />
        )}
        {v === 'settled' && (
          <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white" />
        )}
        {(v === 'dim' || (v === 'flowing' && reduced)) && (
          <span className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
        )}
      </div>
    </div>
  );
}

export function ConfluenceHero({
  running,
  resolved,
  statuses,
  estructuraStatus,
  a4,
  confluence,
}: ConfluenceHeroProps) {
  const reduced = useReducedMotion();
  const progress = useAsymptoticProgress(running && !resolved, resolved, reduced);

  const pct = confluence?.total_pct ?? a4?.confluence.score_total_pct ?? null;
  const level = confluence?.level ?? null;
  const estPct = Math.round(progress * 100);

  return (
    <div className="mx-4 mt-3 rounded-[15px] border border-white/5 bg-surface-2 p-4">
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
        <span className="text-accent">confluencia</span>
        <span className="text-white/45">{resolved ? 'resuelto' : 'consolidando'}</span>
      </div>

      {/* Corrientes — ambientales y unificadas hasta el clímax. La 4ª (EST) solo
          aparece si el usuario activó el Agente de Estructura. */}
      <div className="flex items-start gap-2">
        <Stream cfg={STREAMS[0]!} status={statuses.a1} reduced={reduced} delay="0s" />
        <Stream cfg={STREAMS[1]!} status={statuses.a2} reduced={reduced} delay="0.8s" />
        <Stream cfg={STREAMS[2]!} status={statuses.a3} reduced={reduced} delay="1.4s" />
        {estructuraStatus && (
          <Stream cfg={EST_STREAM} status={estructuraStatus} reduced={reduced} delay="2s" />
        )}
      </div>

      {/* Núcleo — se construye (espera) o resuelve (reveal). Transición CSS. */}
      <div
        className={cn(
          'mt-3 rounded-lg p-3 transition-[border-color,background-color] duration-700',
          resolved
            ? 'border border-accent bg-void'
            : 'border border-dashed border-accent/50 bg-surface-3/40',
          !resolved && !reduced && 'animate-blink'
        )}
        aria-live="polite"
      >
        {resolved ? (
          <div className="flex items-baseline justify-center gap-2 text-center">
            <span className="font-mono text-[14px] font-bold tabular-nums text-white">
              {pct !== null ? `${pct}%` : '—'}
            </span>
            {level && <span className="font-mono text-[12px] uppercase tracking-wider text-accent">{level}</span>}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-white/66">consolidando señales</span>
              <span className="font-mono text-[11px] tabular-nums text-accent">~{estPct}%</span>
            </div>
            <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/10">
              <div
                className={cn('h-full rounded-full bg-accent', !reduced && 'transition-[width] duration-200 ease-out')}
                style={{ width: `${estPct}%` }}
              />
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-white/30">
              estimación · no llega al 100% hasta el resultado real
            </div>
          </>
        )}
      </div>
    </div>
  );
}
