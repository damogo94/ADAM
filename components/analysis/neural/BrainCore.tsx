import { cn } from '@/lib/utils';
import {
  BRAIN_OUTLINE,
  BRAIN_FISSURE,
  BRAIN_GYRI,
  BRAIN_SYNAPSES,
  BRAIN_WEB,
  type Region,
} from './brain-paths';

/**
 * Núcleo cerebro NEUTRO (estructura en tinta). El accent vive en la energía:
 * sinapsis que se encienden por región real + dendritas que "disparan" en
 * cascada cuando ambos extremos ya están encendidos. El número es la estimación
 * asintótica (running, accent) o el accionable real (resolved, tono dirección).
 *
 * Honestidad: una región solo se enciende si su agente aterrizó de verdad
 * (`litRegions` deriva de AgentStatus). El número nunca llega a 100% hasta resolve.
 */
export function BrainCore({
  litRegions,
  resolved,
  breathing,
  reduced,
  displayPct,
  sublabel,
  numberClass,
  transform,
  transformOrigin,
}: {
  litRegions: Set<Region>;
  resolved: boolean;
  breathing: boolean;
  reduced: boolean;
  displayPct: string;
  sublabel: string;
  numberClass: string;
  transform: string;
  transformOrigin: string;
}) {
  const lit = (r: Region) => litRegions.has(r);

  return (
    <g
      className={cn(breathing && !reduced && 'animate-core-breath')}
      style={{ transformBox: 'view-box', transformOrigin }}
    >
      <g transform={transform}>
        {/* contorno + circunvoluciones (tinta; brillan al resolver) */}
        <path
          className={cn('fill-accent/5 transition-[stroke] duration-700', resolved ? 'stroke-ink/55' : 'stroke-ink/15')}
          d={BRAIN_OUTLINE}
          strokeWidth={resolved ? 2.2 : 2}
          strokeLinejoin="round"
        />
        <path className={cn('fill-none transition-opacity duration-700', resolved ? 'stroke-ink/20' : 'stroke-ink/10')} d={BRAIN_FISSURE} strokeWidth={1} strokeLinecap="round" />
        {BRAIN_GYRI.map((d, i) => (
          <path
            key={i}
            className={cn('fill-none transition-opacity duration-700', resolved ? 'stroke-ink/20' : 'stroke-ink/10')}
            d={d}
            strokeWidth={1}
            strokeLinecap="round"
          />
        ))}

        {/* dendritas — disparan cuando ambos extremos están encendidos */}
        {BRAIN_WEB.map((w, i) => {
          const both = lit(w.ra) && lit(w.rb);
          return (
            <line
              key={i}
              className={cn('fill-none', both ? cn('stroke-ink/20', !reduced && 'animate-web-fire') : 'stroke-ink/5')}
              x1={w.x1}
              y1={w.y1}
              x2={w.x2}
              y2={w.y2}
              strokeWidth={0.8}
            />
          );
        })}

        {/* sinapsis — encienden por región real con stagger centro→fuera */}
        {BRAIN_SYNAPSES.map((s, i) => {
          const on = lit(s.region);
          return (
            <circle
              key={i}
              className={cn(
                'transition-opacity duration-300',
                on
                  ? cn('fill-accent', !reduced && (resolved ? 'animate-syn-twinkle' : 'animate-syn-pop'))
                  : 'fill-accent/10'
              )}
              cx={s.cx}
              cy={s.cy}
              r={3.6}
              style={{ transformBox: 'fill-box', transformOrigin: 'center', animationDelay: `${s.order * 90}ms` }}
            />
          );
        })}

        {/* número + sublabel */}
        <text className={cn('font-mono transition-[fill] duration-500', numberClass)} x={240} y={297} textAnchor="middle" fontSize={15} fontWeight={600}>
          {displayPct}
        </text>
        <text className="font-mono fill-ink/28 uppercase" x={240} y={312} textAnchor="middle" fontSize={8} letterSpacing="0.08em">
          {sublabel}
        </text>
      </g>
    </g>
  );
}
