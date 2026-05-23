'use client';

/**
 * DictamenSparkline — sparkline cuyo COLOR sale del dictamen A4
 * (no de la pendiente de la propia serie). Wrapper sobre <Sparkline>.
 *
 * Por qué: el panel debe ser coherente con A4. Si A4 dice "negativo"
 * por anomalía de fundamentales pero la serie de precio ha subido en
 * 30D, pintar la línea en verde confundiría al usuario. El color SIGUE
 * AL DICTAMEN, no al precio.
 *
 * Estados:
 *   - direction null + valores ≥ 2  → blanco/40 (neutro, sin opinión)
 *   - direction 'positivo'          → emerald
 *   - direction 'negativo'          → rose
 *   - direction 'neutral'           → white/60
 *   - sin valores (<2)              → línea discontinua + texto "sin histórico"
 */

import { Sparkline } from '@/components/sparkline';
import { cn } from '@/lib/utils';
import type { RadarDirection_t } from '@/lib/radar/types';

interface DictamenSparklineProps {
  values: number[];
  direction: RadarDirection_t | null;
  width?: number;
  height?: number;
  /** Atenúa si el análisis está stale. */
  stale?: boolean;
  className?: string;
}

const COLORS: Record<RadarDirection_t | 'unknown', string> = {
  positivo: 'rgb(16 185 129)', // emerald
  negativo: 'rgb(244 63 94)', // rose
  neutral: 'rgb(255 255 255 / 0.6)', // blanco medio
  unknown: 'rgb(255 255 255 / 0.4)', // blanco bajo
};

export function DictamenSparkline({
  values,
  direction,
  width = 64,
  height = 22,
  stale = false,
  className,
}: DictamenSparklineProps) {
  // Estado "sin histórico" — degradación limpia, jamás layout shift.
  if (!values || values.length < 2) {
    return (
      <div
        className={cn('flex flex-col items-end gap-px', className)}
        style={{ width, height: height + 10 }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <line
            x1={0}
            y1={height / 2}
            x2={width}
            y2={height / 2}
            stroke="rgb(255 255 255 / 0.15)"
            strokeDasharray="2 3"
            strokeWidth={0.6}
          />
        </svg>
        <span className="font-mono text-[7px] uppercase tracking-wider text-white/30">
          sin histórico
        </span>
      </div>
    );
  }

  const color = COLORS[direction ?? 'unknown'];
  return (
    <Sparkline
      values={values}
      width={width}
      height={height}
      stroke={color}
      className={cn(stale && 'opacity-50', className)}
    />
  );
}
