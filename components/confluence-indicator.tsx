import { cn } from '@/lib/utils';
import type { ConfluenceResult } from '@/lib/confluence';

interface ConfluenceIndicatorProps {
  data: ConfluenceResult | null;
}

export function ConfluenceIndicator({ data }: ConfluenceIndicatorProps) {
  const total = data?.total_pct ?? 0;
  const level = data?.level ?? 'baja';

  return (
    <div className="rounded-[15px] border border-white/5 bg-surface-2 px-3.5 py-3 transition-all duration-500">
      <div className="font-orbitron text-[11px] font-bold tracking-[0.1em] text-white mb-0.5">CONFLUENCIA</div>
      <div className="font-mono text-[8px] text-slate mb-3">alineamiento entre agentes activos</div>

      <div className="flex flex-col gap-2 mb-3">
        <ConfluenceRow
          label="A3 solo"
          score={data?.a3_solo.score ?? 0}
          accentDot="bg-a1"
          glow="shadow-[0_0_7px_rgba(59,130,246,0.7)]"
          rightLabel={data ? labelFromScore(data.a3_solo.score) : '—'}
          rightCls={data ? colorFromScore(data.a3_solo.score) : 'text-slate'}
        />
        <ConfluenceRow
          label="A1 + A2"
          score={data?.a1_a2.score ?? 0}
          accentDot="bg-a3"
          glow="shadow-[0_0_7px_rgba(245,158,11,0.7)]"
          rightLabel={data ? labelFromScore(data.a1_a2.score) : '—'}
          rightCls={data ? colorFromScore(data.a1_a2.score) : 'text-slate'}
        />
        <ConfluenceRow
          label="Alineados"
          score={data?.alineados.score ?? 0}
          accentDot="bg-emerald"
          glow="shadow-[0_0_7px_rgba(16,185,129,0.7)]"
          rightLabel={data ? labelFromPct(data.total_pct) : '—'}
          rightCls={data ? colorFromPct(data.total_pct) : 'text-slate'}
        />
      </div>

      {/* Bar */}
      <div className="mb-3 h-0.5 w-full rounded-sm bg-white/5 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-sm transition-[width] duration-700 ease-out',
            level === 'alta'
              ? 'bg-gradient-to-r from-emerald to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
              : level === 'media'
                ? 'bg-a3'
                : 'bg-slate'
          )}
          style={{ width: `${total}%` }}
        />
      </div>

      {/* Score */}
      <div
        className={cn(
          'rounded-[11px] px-2 py-2.5 text-center transition-all duration-500',
          level === 'alta' ? 'bg-emerald/[0.07]' : level === 'media' ? 'bg-a3/[0.07]' : 'bg-slate/[0.08]'
        )}
      >
        <div
          className={cn(
            'font-orbitron text-[30px] font-black tracking-[0.04em]',
            level === 'alta' ? 'text-emerald' : level === 'media' ? 'text-a3' : 'text-slate-l'
          )}
        >
          {total > 0 ? `${total}%` : '—'}
        </div>
        <div
          className={cn(
            'mt-0.5 font-mono text-[9px]',
            level === 'alta' ? 'text-emerald' : level === 'media' ? 'text-a3' : 'text-slate'
          )}
        >
          confianza {level}
        </div>
      </div>
    </div>
  );
}

function ConfluenceRow({
  label,
  score,
  accentDot,
  glow,
  rightLabel,
  rightCls,
}: {
  label: string;
  score: number;
  accentDot: string;
  glow: string;
  rightLabel: string;
  rightCls: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-slate-l w-[68px] flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-2.5 rounded-full border border-white/[0.08] transition-all duration-500',
              i <= score ? cn(accentDot, glow) : ''
            )}
            style={{ transitionDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      <span className={cn('ml-auto font-mono text-[10px] text-right min-w-[32px]', rightCls)}>{rightLabel}</span>
    </div>
  );
}

function labelFromScore(s: number): string {
  if (s >= 4) return 'alta';
  if (s >= 3) return 'media';
  return 'baja';
}
function labelFromPct(p: number): string {
  if (p >= 67) return 'alta';
  if (p >= 34) return 'media';
  return 'baja';
}
function colorFromScore(s: number): string {
  if (s >= 4) return 'text-emerald';
  if (s >= 3) return 'text-a3';
  return 'text-slate';
}
function colorFromPct(p: number): string {
  if (p >= 67) return 'text-emerald';
  if (p >= 34) return 'text-a3';
  return 'text-slate';
}
