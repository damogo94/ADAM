import { cn } from '@/lib/utils';
import type { ConfluenceResult } from '@/lib/confluence';

interface ConfluenceIndicatorProps {
  data: ConfluenceResult | null;
}

/**
 * Re-skin B&W: la confluencia se comunica por INTENSIDAD de blanco
 * (55% baja, 70% media, 100% alta) en vez de hue (slate/amber/emerald).
 * El piso es 55% (no 40%) para no caer bajo el umbral de contraste AA.
 *
 * Los dots de cada fila también escalan en intensidad. La barra de progreso
 * es un trazo blanco simple — sin gradient ni glow colorado.
 */
export function ConfluenceIndicator({ data }: ConfluenceIndicatorProps) {
  const total = data?.total_pct ?? 0;
  // null en estado vacío (sin análisis) → NO inventamos un nivel "baja"
  // fantasma. El número ya muestra "—"; el texto mostrará "—" también.
  const level = data?.level ?? null;

  return (
    <div className="rounded-[15px] border border-white/5 bg-surface-2 px-3.5 py-3 transition-all duration-500">
      <div className="font-orbitron text-[11px] font-bold tracking-[0.1em] text-white mb-0.5">CONFLUENCIA</div>
      <div className="font-mono text-[11px] text-white/55 mb-3">alineamiento entre agentes activos</div>

      <div className="flex flex-col gap-2 mb-3">
        <ConfluenceRow
          label="A3 solo"
          score={data?.a3_solo.score ?? 0}
          rightLabel={data ? labelFromScore(data.a3_solo.score) : '—'}
          rightCls={data ? intensityFromScore(data.a3_solo.score) : 'text-white/45'}
        />
        <ConfluenceRow
          label="A1 + A2"
          score={data?.a1_a2.score ?? 0}
          rightLabel={data ? labelFromScore(data.a1_a2.score) : '—'}
          rightCls={data ? intensityFromScore(data.a1_a2.score) : 'text-white/45'}
        />
        <ConfluenceRow
          label="Alineados"
          score={data?.alineados.score ?? 0}
          rightLabel={data ? labelFromPct(data.total_pct) : '—'}
          rightCls={data ? intensityFromPct(data.total_pct) : 'text-white/45'}
        />
      </div>

      {/* Bar — trazo blanco con intensidad escalada según nivel */}
      <div className="mb-3 h-px w-full bg-white/10 overflow-hidden">
        <div
          className={cn(
            'h-full transition-[width,opacity] duration-700 ease-out bg-white',
            level === 'alta' ? 'opacity-100' : level === 'media' ? 'opacity-70' : 'opacity-40'
          )}
          style={{ width: `${total}%` }}
        />
      </div>

      {/* Score */}
      <div
        className={cn(
          'rounded-[11px] px-2 py-2.5 text-center transition-all duration-500 border',
          level === null
            ? 'border-white/8 bg-white/[0.015]'
            : level === 'alta'
              ? 'border-white/25 bg-white/[0.06]'
              : level === 'media'
                ? 'border-white/15 bg-white/[0.04]'
                : 'border-white/10 bg-white/[0.02]'
        )}
      >
        <div
          className={cn(
            'font-orbitron text-[30px] font-black tracking-[0.04em]',
            level === null
              ? 'text-white/45'
              : level === 'alta'
                ? 'text-white'
                : level === 'media'
                  ? 'text-white/75'
                  : 'text-white/55'
          )}
        >
          {total > 0 ? `${total}%` : '—'}
        </div>
        <div
          className={cn(
            'mt-0.5 font-mono text-[11px] uppercase tracking-wider',
            level === null
              ? 'text-white/45'
              : level === 'alta'
                ? 'text-white/80'
                : level === 'media'
                  ? 'text-white/65'
                  : 'text-white/55'
          )}
        >
          confianza · {level === null ? '—' : level}
        </div>
      </div>
    </div>
  );
}

function ConfluenceRow({
  label,
  score,
  rightLabel,
  rightCls,
}: {
  label: string;
  score: number;
  rightLabel: string;
  rightCls: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[12px] text-white/70 w-[68px] flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {/* 5 dots = quintiles del score 0-100. Cada dot representa 20%. */}
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-2.5 rounded-full border transition-all duration-500',
              i <= Math.ceil(score / 20)
                ? 'bg-white border-white/40 shadow-[0_0_4px_rgba(255,255,255,0.5)]'
                : 'bg-transparent border-white/15'
            )}
            style={{ transitionDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      <span className={cn('ml-auto font-mono text-[12px] text-right min-w-[48px] tabular-nums', rightCls)}>
        {score > 0 ? `${score}%` : '—'} <span className="opacity-50">· {rightLabel}</span>
      </span>
    </div>
  );
}

function labelFromScore(s: number): string {
  if (s >= 67) return 'alta';
  if (s >= 34) return 'media';
  return 'baja';
}
function labelFromPct(p: number): string {
  if (p >= 67) return 'alta';
  if (p >= 34) return 'media';
  return 'baja';
}
function intensityFromScore(s: number): string {
  if (s >= 67) return 'text-white';
  if (s >= 34) return 'text-white/70';
  return 'text-white/55';
}
function intensityFromPct(p: number): string {
  if (p >= 67) return 'text-white';
  if (p >= 34) return 'text-white/70';
  return 'text-white/55';
}
