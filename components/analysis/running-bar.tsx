import type { AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';

/**
 * RunningBar — instrumento persistente DURANTE el run (contraparte de VerdictBar).
 *
 * Es la señal "sistema vivo" que PERMANECE pegada arriba mientras el usuario baja a
 * leer las cards — H6: el OrbitalHero completo se va del viewport en la espera. Ocupa
 * el mismo slot sticky que VerdictBar y es MUTUAMENTE EXCLUYENTE con ella (esta corre
 * mientras el run no ha resuelto; VerdictBar toma el relevo al cerrar A4), así que
 * nunca compiten por el `top-0` ni por el z-index (D8: sin colisión del stack sticky).
 *
 * HONESTIDAD (líneas rojas):
 * - NO muestra un número asintótico: ese vive solo en el hero; duplicarlo sería un 2º
 *   reloj indeterminado sobre un wait ya saturado (presupuesto de motion, D2).
 * - La vitalidad es EVENT-DRIVEN: cada punto por-agente se enciende con su evento REAL
 *   (`settled` = done/anomaly, igual que el satélite del hero) — no fabrica progreso.
 * - Un único latido `accent` (indeterminado, "sigue en curso") marca que el sistema no
 *   está colgado durante el dead-air; reduced-motion lo deja estático (blanket CSS).
 * - Cromo SOLO accent/ink (firewall); ningún emerald/rose/amber.
 */
const isSettled = (s: AgentStatus): boolean => s === 'done' || s === 'anomaly';

export function RunningBar({
  ticker,
  statuses,
}: {
  ticker: string;
  statuses: { a1: AgentStatus; a2: AgentStatus; a3: AgentStatus };
}) {
  const agents: { id: 'a1' | 'a2' | 'a3'; status: AgentStatus }[] = [
    { id: 'a1', status: statuses.a1 },
    { id: 'a2', status: statuses.a2 },
    { id: 'a3', status: statuses.a3 },
  ];
  const settled = agents.filter((a) => isSettled(a.status)).length;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Consolidando ${ticker}: ${settled} de 3 agentes han aterrizado`}
      className="sticky top-0 z-20 mx-4 mt-3 rounded-card border border-ink/10 bg-surface-2/90 px-3 py-2 shadow-e2 edge-hi backdrop-blur-sm transition-[border-color,box-shadow] duration-300 ease-precise"
    >
      <div className="flex items-center gap-2">
        <span className="flex flex-shrink-0 items-center gap-1.5 font-mono text-fluid-micro uppercase tracking-[0.2em] text-ink/58 before:h-px before:w-3 before:bg-accent/80 before:content-['']">
          consolidando
        </span>
        {/* Latido único: indeterminado y honesto ("sigue en curso", no progreso).
            reduced-motion lo neutraliza (motion-safe: + blanket de globals). */}
        <span
          className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-blink"
          aria-hidden="true"
        />
        <span className="font-sans text-fluid-label font-bold tracking-wider text-ink">{ticker}</span>

        <span className="ml-auto flex items-center gap-2.5">
          <span className="hidden font-mono text-fluid-micro uppercase tracking-wider text-ink/66 sm:inline">
            agentes
          </span>
          {/* Puntos por-agente: se encienden con el evento REAL (settled). Vitalidad
              event-driven, sin reloj indeterminado — coincide con el satélite del hero. */}
          <span className="flex gap-1" aria-hidden="true">
            {agents.map((a) => (
              <span
                key={a.id}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors duration-300 ease-precise',
                  isSettled(a.status)
                    ? 'bg-accent'
                    : a.status === 'error'
                      ? 'bg-white/15'
                      : 'bg-white/30'
                )}
              />
            ))}
          </span>
          <span className="font-mono text-fluid-caption tabular-nums text-ink/75">{settled}/3</span>
        </span>
      </div>
    </div>
  );
}
