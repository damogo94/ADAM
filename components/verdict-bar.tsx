import type { A4Output_t as A4Output } from '@/agents/shared/types';
import type { ConfluenceResult } from '@/lib/confluence';
import { DirectionBadge, ConfidenceChip } from '@/components/agent-primitives';
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
  // La confluencia del indicador (recalculada en cliente con el A2 tardío) manda
  // sobre la horneada en A4; si no hay, cae a la de A4.
  const pct = confluence?.total_pct ?? a4.confluence.score_total_pct;

  return (
    <div className="sticky top-0 z-20 mx-4 mt-3 rounded-[13px] border border-white/10 bg-surface-2/90 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-orbitron text-[8px] font-bold tracking-wider text-white/70">
          VEREDICTO
        </span>
        <DirectionBadge dir={a4.direccion} />
        <span className={cn('font-orbitron text-[14px] font-bold tracking-wider', dirCls)}>{dirLabel}</span>

        <span className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-white/55 sm:inline">
            confluencia
          </span>
          <span className="font-orbitron text-[14px] font-bold tabular-nums text-white">{pct}%</span>
          <ConfidenceChip value={a4.confianza} showBar />
          {aligned && (
            <span className="flex-shrink-0 rounded border border-emerald/40 bg-emerald/[0.10] px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-emerald">
              A3 ✓
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] leading-snug text-white/80">{a4.accion_sugerida}</div>
    </div>
  );
}
