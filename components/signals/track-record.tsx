import { cn } from '@/lib/utils';
import { Glossed } from '@/components/lens/glossed';
import { OutcomeChip } from '@/components/signals/outcome';
import type { TrackRecord } from '@/components/signals/helpers';

// ── Track record (resumen hit-rate) ──────────────────────────────────────────
export function TrackRecordPanel({ track }: { track: TrackRecord }) {
  const empty = track.denom === 0;
  return (
    <div className="rounded-card-sm border border-white/8 bg-surface-2 px-3.5 py-3">
      <div className="flex items-center gap-4">
        {/* Hit-rate */}
        <div className="flex flex-col items-center">
          <div className={cn('font-mono text-[28px] font-black leading-none', empty ? 'text-ink/66' : 'text-ink')}>
            {empty ? '—' : `${track.hitRate}%`}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-ink/66"><Glossed term="hit_rate">tasa de acierto</Glossed></div>
        </div>

        {/* Detalle */}
        <div className="flex-1">
          {empty ? (
            <div className="font-mono text-[11px] leading-snug text-ink/66">
              sin señales resueltas todavía — el seguimiento corre cada noche y
              clasificará las señales 1D al tocar target o stop.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <OutcomeChip label="win" n={track.win} cls="text-emerald border-emerald/35 bg-emerald/[0.07]" />
                <OutcomeChip label="loss" n={track.loss} cls="text-rose border-rose/35 bg-rose/[0.07]" />
                <OutcomeChip label="timeout" n={track.timeout} cls="text-amber border-amber/30 bg-amber/[0.06]" />
                {track.noFill > 0 && (
                  <OutcomeChip label="no fill" n={track.noFill} cls="text-ink/66 border-white/12 bg-white/[0.02]" />
                )}
              </div>
              <div className="mt-1.5 font-mono text-[11px] text-ink/66">
                {track.denom} resuelta{track.denom > 1 ? 's' : ''}
                {track.avgR != null && (
                  <>
                    {' · ganancia media '}
                    <span className={cn('font-medium', track.avgR >= 0 ? 'text-emerald' : 'text-rose')}>
                      {track.avgR >= 0 ? '+' : ''}
                      {track.avgR.toFixed(2)}
                    </span>
                  </>
                )}
                {track.sumR != null && (
                  <>
                    {' · Σ '}
                    <RSpan r={track.sumR} />
                  </>
                )}
              </div>
              {/* Cifra por fila = una fila por reemisión diaria del mismo nivel.
                  El n efectivo es el número de clusters (ticker + dirección +
                  entrada ±1% + ≤3 días); cada cluster cuenta por su fila más
                  antigua. Texto sobrio: es una nota de medición, no un juicio. */}
              <ClusterLine c={track.clusters} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** R con color semántico (dato de resultado, no chrome). */
function RSpan({ r }: { r: number }) {
  return (
    <span className={cn('font-medium tabular-nums', r >= 0 ? 'text-emerald' : 'text-rose')}>
      {r >= 0 ? '+' : ''}
      {r.toFixed(1)}R
    </span>
  );
}

function ClusterLine({ c }: { c: TrackRecord['clusters'] }) {
  return (
    <div className="mt-1 font-mono text-[11px] leading-snug text-ink/45">
      <span className="text-ink/66">
        por cluster · n={c.n} · {c.win}W/{c.loss}L
        {c.timeout > 0 ? `/${c.timeout}T` : ''}
        {c.hitRate != null ? ` · ${c.hitRate}%` : ''}
        {c.sumR != null && (
          <>
            {' · Σ '}
            <RSpan r={c.sumR} />
          </>
        )}
      </span>
      {' — '}
      la cifra por fila cuenta cada reemisión diaria del mismo nivel; el cluster
      agrupa ticker + dirección + entrada ±{c.entryTolerancePct}% + ≤{c.gapDays} días
      y cuenta por su fila más antigua
      {c.unclustered > 0 ? ` (${c.unclustered} sin cluster)` : ''}.
    </div>
  );
}
