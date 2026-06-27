import type { A4Output_t as A4Output } from '@/agents/shared/types';
import type { ConfluenceResult } from '@/lib/confluence';
import { DirectionBadge } from '@/components/agent-primitives';
import { cn } from '@/lib/utils';

/**
 * VerdictBar — franja de veredicto consolidado (A4), pegada arriba.
 *
 * Es lo PRIMERO que ve el usuario en cuanto el run termina: dirección +
 * confianza + confluencia% + acción sugerida, sin tener que hacer scroll
 * hasta el final del stack. Sticky en cualquier viewport. Reutiliza los
 * primitivos (DirectionBadge/ConfidenceChip) y los tokens existentes.
 */
export function VerdictBar({
  a4,
  confluence,
  aligned,
}: {
  a4: A4Output;
  confluence: ConfluenceResult | null;
  aligned: boolean;
}) {
  const dirLabel =
    a4.direccion === 'positivo' ? 'ALCISTA' : a4.direccion === 'negativo' ? 'BAJISTA' : 'NEUTRAL';
  const dirCls =
    a4.direccion === 'positivo'
      ? 'text-emerald'
      : a4.direccion === 'negativo'
        ? 'text-rose'
        : 'text-white/70';
  // Titular (Fase 1 · ejes separados): la cifra de cabecera es la CONFIANZA
  // ACCIONABLE (|net|×f(κ), ya descontada por la discrepancia). κ se muestra
  // como eje propio al lado. score_total_pct se retira al detalle (indicador).
  // Null-guard: análisis/filas sin los ejes nuevos caen al confluence viejo.
  const actionable =
    confluence?.actionable_pct ?? confluence?.total_pct ?? a4.confluence.score_total_pct;
  const kappa = confluence?.kappa ?? null;

  return (
    <div className="sticky top-0 z-20 mx-4 mt-3 rounded-card border border-ink/10 bg-surface-2/90 px-3 py-2 shadow-e2 edge-hi backdrop-blur-sm transition-[border-color,box-shadow] duration-300 ease-precise">
      <div className="flex items-center gap-2">
        <span className="flex flex-shrink-0 items-center gap-1.5 font-mono text-fluid-micro uppercase tracking-[0.2em] text-ink/58 before:h-px before:w-3 before:bg-accent/80 before:content-['']">
          VEREDICTO
        </span>
        <DirectionBadge dir={a4.direccion} />
        <span className={cn('font-sans text-fluid-label font-bold tracking-wider', dirCls)}>{dirLabel}</span>

        <span className="ml-auto flex items-center gap-2.5">
          {/* Cifra de cabecera = confianza accionable (ya descontada por κ). */}
          <span className="flex items-baseline gap-1.5">
            <span className="hidden font-mono text-fluid-micro uppercase tracking-wider text-white/66 sm:inline">
              accionable
            </span>
            <span className="font-mono text-fluid-label font-bold tabular-nums text-white">{actionable}%</span>
          </span>
          {/* κ — eje de coherencia, dedicado. Oculto en filas viejas sin κ. */}
          {kappa !== null && (
            <span className="flex items-center gap-1.5 border-l border-white/10 pl-2.5">
              <span className="hidden font-mono text-fluid-micro uppercase tracking-wider text-white/66 sm:inline">
                κ
              </span>
              <KappaDots kappa={kappa} />
              <span className="font-mono text-fluid-caption tabular-nums text-white/75">{Math.round(kappa * 100)}%</span>
            </span>
          )}
          {aligned && (
            <span className="flex-shrink-0 rounded border border-accent/40 bg-accent/[0.06] px-1.5 py-0.5 font-mono text-fluid-caption tracking-wider text-accent">
              A3 ✓
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 truncate font-mono text-fluid-caption leading-snug text-white/80">{a4.accion_sugerida}</div>
    </div>
  );
}

/** Medidor compacto de κ (coherencia): 5 puntos, llenos = round(κ × 5). */
function KappaDots({ kappa }: { kappa: number }) {
  const filled = Math.round(kappa * 5);
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors',
            i <= filled ? 'bg-accent' : 'bg-white/15'
          )}
        />
      ))}
    </span>
  );
}
