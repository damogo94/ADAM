'use client';

import { useEffect, useRef, useState } from 'react';
import type { A4Output_t as A4Output, A1Output_t, A2Output_t, A3Output_t } from '@/agents/shared/types';
import type { ConfluenceResult } from '@/lib/confluence';
import type { AgentStatus } from '@/components/agent-card-shell';
import { normalizeDirection } from '@/components/agent-primitives';
import { NeuralGraph, type AgentVisual, type Dir } from './neural/NeuralGraph';
import { DESKTOP_LAYOUT, PORTRAIT_LAYOUT, type Region } from './neural/brain-paths';

/**
 * ConfluenceHero — la pieza protagonista del momento "running" de /analysis.
 *
 * Pipeline neuronal: cada agente es un CHIP que, al aterrizar, energiza por un
 * CABLE (corriente accent) un NÚCLEO CEREBRO neutro que se completa por regiones
 * en cascada y RESUELVE en el veredicto al cerrar A4.
 *
 * INVARIANTE DE HONESTIDAD (línea roja del proyecto):
 *   Ningún estado "completado" precede a su evento real. El hero NUNCA fabrica
 *   un hito por-agente:
 *     - Un chip/región solo energiza cuando su `AgentStatus` real es done/anomaly
 *       (`error` → atenuado; `scanning`/`idle` → calibrando). El debate solo se
 *       enciende si CORRIÓ de verdad (es condicional). Si un agente falla, su
 *       región queda apagada aunque el núcleo resuelva.
 *     - El número del núcleo es una ESTIMACIÓN asintótica que jamás llega al 100%
 *       hasta el `resolve` real (`useAsymptoticProgress`). Etiquetado "consolidando
 *       ~X%" en accent; al resolver pasa al accionable real en tono de dirección.
 *
 * NO-NEGOCIABLES DE DISEÑO:
 *   - Chrome (chips, cables, cerebro, dendritas, sinapsis, `~X%`) = accent/ink.
 *     emerald/rose SOLO en dato de mercado: número resuelto + glifo del veredicto
 *     + glifo de dirección por chip. amber jamás aquí.
 *   - A3 aislado: chip + cable punteados; ninguna arista lo conecta con A1/A2/debate.
 *   - Color SVG vía utilidades Tailwind fill-/stroke- (NO var() en atributos).
 *   - `prefers-reduced-motion`: variante estática equivalente (end-state directo).
 *
 * NOTA: el carrusel teatral de pasos rotando NO se porta (se retiró al pasar /run
 * a streaming). El chip muestra etiqueta de dominio estática mientras calibra y un
 * glifo de DIRECCIÓN REAL al aterrizar (derivado de la salida del agente). El
 * detalle de pasos vive en las cards.
 */

interface ConfluenceHeroProps {
  /** Algún agente en `scanning` → run en vuelo (espera). */
  running: boolean;
  /** A4 cerró → dispara el reveal. */
  resolved: boolean;
  /** Estados reales por-agente. Solo para energizar en done/anomaly o atenuar en error. */
  statuses: { a1: AgentStatus; a2: AgentStatus; a3: AgentStatus };
  /** Estado del Agente de Estructura (opt-in). Aceptado por contrato; el grafo v1
   *  no pinta nodo dedicado (la card de Estructura sigue debajo). */
  estructuraStatus?: AgentStatus;
  /** Veredicto consolidado (reveal). null mientras corre. */
  a4: A4Output | null;
  /** Confluencia recalculada en cliente; preferida sobre la horneada en A4. */
  confluence: ConfluenceResult | null;
  /** Estado real del debate (condicional). El nodo `deb` solo enciende si corrió. */
  debateStatus?: AgentStatus;
  /** Salidas por-agente — SOLO presentacional, para el glifo de dirección real del chip. */
  a1?: A1Output_t | null;
  a2?: A2Output_t | null;
  a3?: A3Output_t | null;
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
 * en ~0.92 — NUNCA llega a 1 hasta que `resolved` es verdad. τ=26: ~0.66 a 28s
 * (p50), ~0.86 a 52s (p95). No es % real de trabajo, es una curva de espera
 * honesta por construcción.
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

const settled = (s: AgentStatus | undefined) => s === 'done' || s === 'anomaly';
const chipState = (s: AgentStatus): AgentVisual['state'] =>
  s === 'error' ? 'dim' : settled(s) ? 'energized' : 'calibrating';

const TONE_NUM: Record<Dir, string> = { up: 'fill-emerald', down: 'fill-rose', flat: 'fill-ink/72' };

export function ConfluenceHero({
  running,
  resolved,
  statuses,
  a4,
  confluence,
  debateStatus,
  a1,
  a2,
  a3,
}: ConfluenceHeroProps) {
  const reduced = useReducedMotion();
  const progress = useAsymptoticProgress(running && !resolved, resolved, reduced);

  const a1Dir = normalizeDirection(a1?.anomaly_type ?? null);
  const a2Dir = normalizeDirection(a2?.regime_outlook ?? (a2?.opportunity_detected ? 'risk_on' : null));
  const a3Dir = normalizeDirection(a3?.tendencia?.primaria ?? null);

  const agents: Record<'a1' | 'a2' | 'a3', AgentVisual> = {
    a1: { state: chipState(statuses.a1), dir: a1Dir },
    a2: { state: chipState(statuses.a2), dir: a2Dir },
    a3: { state: chipState(statuses.a3), dir: a3Dir },
  };

  // Regiones encendidas = SOLO agentes aterrizados de verdad (errores no encienden,
  // ni siquiera en resolve — el cerebro resuelve pero la región fallida queda oscura).
  const debateSettled = settled(debateStatus);
  const litRegions = new Set<Region>();
  if (settled(statuses.a1)) litRegions.add('a1');
  if (settled(statuses.a2)) litRegions.add('a2');
  if (settled(statuses.a3)) litRegions.add('a3');
  if (debateSettled) litRegions.add('deb');

  const cableFlow: Record<Region, boolean> = {
    a1: settled(statuses.a1),
    a2: settled(statuses.a2),
    a3: settled(statuses.a3),
    deb: debateSettled,
    est: false,
  };

  const actionable =
    confluence?.actionable_pct ?? confluence?.total_pct ?? a4?.confluence.score_total_pct ?? null;
  const dirOfConfluence: Dir = confluence ? normalizeDirection(confluence.direction) : 'flat';
  const estPct = Math.round(progress * 100);
  const displayPct = resolved ? (actionable !== null ? `${actionable}%` : '—') : `~${estPct}%`;
  const sublabel = resolved ? 'accionable' : 'consolidando';
  const numberClass = resolved ? TONE_NUM[dirOfConfluence] : 'fill-accent';
  const kappaPct = confluence?.kappa != null ? Math.round(confluence.kappa * 100) : null;
  const verdict = resolved ? { dir: dirOfConfluence, kappa: kappaPct } : null;
  const breathing = running && !resolved;

  const shared = {
    agents,
    debate: { settled: debateSettled },
    litRegions,
    cableFlow,
    resolved,
    breathing,
    reduced,
    displayPct,
    sublabel,
    numberClass,
    verdict,
  } as const;

  return (
    <div className="mx-4 mt-3 rounded-[15px] border border-white/5 bg-surface-2 p-4" aria-live="polite">
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
        <span className="text-accent">pipeline</span>
        <span className="text-white/45">{resolved ? 'resuelto' : 'consolidando'}</span>
      </div>

      <div className="max-[640px]:hidden">
        <NeuralGraph
          layout={DESKTOP_LAYOUT}
          ariaLabel="Pipeline: chips A1 y A2 convergen en el debate; A3 corre en un carril aislado; cables energizan el núcleo cerebro que se completa por regiones."
          {...shared}
        />
      </div>
      <div className="hidden max-[640px]:block">
        <NeuralGraph
          layout={PORTRAIT_LAYOUT}
          ariaLabel="Pipeline vertical: chips A1 y A2 convergen en el debate; A3 en carril aislado; cables energizan el núcleo cerebro."
          {...shared}
        />
      </div>

      <p className="mt-2 text-center font-mono text-[11px] text-white/30">
        estimación · el núcleo no se completa al 100% hasta el resultado real
      </p>
    </div>
  );
}
