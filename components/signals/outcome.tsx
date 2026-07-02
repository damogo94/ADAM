import { cn } from '@/lib/utils';
import type { SignalTradeOutcome } from '@/types/db';
import { RESOLVED_OUTCOMES } from '@/components/signals/helpers';

/**
 * outcomeMeta — color SEMÁNTICO del resultado del trade (no decorativo):
 *   win→emerald · loss→rose · timeout→amber · no_fill/not_evaluable→neutro.
 */
export function outcomeMeta(outcome: string): { label: string; cls: string } {
  switch (outcome) {
    case 'win':
      return { label: 'WIN', cls: 'text-emerald border-emerald/40 bg-emerald/[0.08]' };
    case 'loss':
      return { label: 'LOSS', cls: 'text-rose border-rose/40 bg-rose/[0.08]' };
    case 'timeout':
      return { label: 'TIMEOUT', cls: 'text-amber border-amber/35 bg-amber/[0.07]' };
    case 'no_fill':
      return { label: 'NO FILL', cls: 'text-ink/66 border-white/15 bg-white/[0.03]' };
    default:
      return { label: 'NO EVALUABLE', cls: 'text-ink/66 border-white/10 bg-white/[0.02]' };
  }
}

/** Badge compacto del outcome del trade. Muestra ±R si está resuelto con R. */
export function OutcomeBadge({ outcome }: { outcome: SignalTradeOutcome }) {
  const m = outcomeMeta(outcome.outcome);
  const showR = RESOLVED_OUTCOMES.has(outcome.outcome) && outcome.outcome !== 'no_fill' && outcome.r_multiple != null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-wider', m.cls)}>
      {m.label}
      {showR && (
        <span className="tabular-nums opacity-90">
          {outcome.r_multiple! >= 0 ? '+' : ''}
          {outcome.r_multiple!.toFixed(1)}R
        </span>
      )}
    </span>
  );
}

/** Chip compacto usado en el panel de track-record (win/loss/timeout/no fill). */
export function OutcomeChip({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[11px] tabular-nums', cls)}>
      {n} <span className="uppercase tracking-wider opacity-80">{label}</span>
    </span>
  );
}
