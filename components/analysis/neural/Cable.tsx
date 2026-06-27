import { cn } from '@/lib/utils';

/**
 * Arista = cable. Vaina neutra (ink) + corriente (accent) que fluye cuando el
 * agente aterriza, + plug que se enciende al energizar el núcleo. El accent es
 * la ENERGÍA, no el chrome. A3 (aislado) = cable punteado.
 */
export function Cable({
  d,
  plug,
  flowing,
  isolated,
  reduced,
}: {
  d: string;
  plug: [number, number];
  flowing: boolean;
  isolated?: boolean;
  reduced?: boolean;
}) {
  return (
    <g>
      {/* vaina */}
      <path
        className={cn('fill-none transition-opacity duration-300', flowing ? 'stroke-ink/20' : isolated ? 'stroke-ink/[0.13]' : 'stroke-ink/10')}
        d={d}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={isolated ? '2 7' : undefined}
      />
      {/* corriente — período 16 para casar con dash-flow (offset -16) sin costura */}
      <path
        className={cn(
          'fill-none stroke-accent transition-opacity duration-300',
          flowing ? cn('opacity-90', !reduced && 'animate-dash-flow') : 'opacity-0'
        )}
        d={d}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="6 10"
      />
      {/* plug */}
      <circle
        className={cn('transition-colors duration-300', flowing ? 'fill-accent/25 stroke-accent' : 'fill-void stroke-ink/20')}
        cx={plug[0]}
        cy={plug[1]}
        r={3.2}
        strokeWidth={1.2}
      />
    </g>
  );
}
