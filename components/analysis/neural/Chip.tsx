import { cn } from '@/lib/utils';

export type ChipState = 'calibrating' | 'energized' | 'dim';

/**
 * Nodo agente = chip de CPU. Neutro (ink) mientras calibra; se energiza en
 * `accent` al aterrizar el agente real. El LED parpadea "procesando" y pasa a
 * sólido al done. A3 (aislado) usa cuerpo punteado.
 *
 * Color SVG vía utilidades Tailwind fill-/stroke- (tokens) — NO var() en
 * atributos de presentación (no resuelve en SVG).
 */
export function Chip({
  cx,
  cy,
  id,
  state,
  isolated,
  reduced,
}: {
  cx: number;
  cy: number;
  id: string;
  state: ChipState;
  isolated?: boolean;
  reduced?: boolean;
}) {
  const energized = state === 'energized';
  const dim = state === 'dim';

  const pinCls = energized ? 'stroke-accent/70' : 'stroke-ink/30';
  const bodyStroke = dim ? 'stroke-ink/15' : energized ? 'stroke-accent' : 'stroke-ink/40';
  const coreStroke = energized ? 'stroke-accent/60' : 'stroke-ink/25';
  const idFill = dim ? 'fill-ink/35' : energized ? 'fill-ink' : 'fill-ink/72';
  const ledCls = energized
    ? 'fill-accent'
    : dim
      ? 'fill-ink/20'
      : cn('fill-accent', !reduced && 'animate-blink');

  return (
    <g>
      {[-5, 0, 5].map((dy) => (
        <g key={dy}>
          <line className={pinCls} x1={cx - 12} y1={cy + dy} x2={cx - 16} y2={cy + dy} strokeWidth={1.4} />
          <line className={pinCls} x1={cx + 12} y1={cy + dy} x2={cx + 16} y2={cy + dy} strokeWidth={1.4} />
        </g>
      ))}
      <rect
        className={cn('fill-surface-2 transition-[stroke] duration-300', bodyStroke)}
        x={cx - 12}
        y={cy - 10}
        width={24}
        height={20}
        rx={3}
        strokeWidth={1.4}
        strokeDasharray={isolated ? '2.5 2.5' : undefined}
      />
      <rect className={cn('fill-none', coreStroke)} x={cx - 7} y={cy - 5} width={14} height={10} rx={1.5} strokeWidth={1} />
      <text
        className={cn('font-mono', idFill)}
        x={cx}
        y={cy + 3}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
      >
        {id}
      </text>
      <circle className={cn('transition-[fill] duration-300', ledCls)} cx={cx + 8} cy={cy - 7} r={1.7} />
    </g>
  );
}
