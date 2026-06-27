import { cn } from '@/lib/utils';
import { Chip, type ChipState } from './Chip';
import { Cable } from './Cable';
import { BrainCore } from './BrainCore';
import { AGENT_DOMAIN, type HeroLayout, type Region } from './brain-paths';

export type Dir = 'up' | 'down' | 'flat';
export interface AgentVisual {
  state: ChipState;
  dir: Dir;
}

const DIR_GLYPH: Record<Dir, string> = { up: '▲', down: '▼', flat: '■' };
const DIR_WORD: Record<Dir, string> = { up: 'alcista', down: 'bajista', flat: 'neutral' };
const TONE_FILL: Record<Dir, string> = { up: 'fill-emerald', down: 'fill-rose', flat: 'fill-ink/72' };

function readoutFor(v: AgentVisual, domain: string): { text: string; cls: string } {
  if (v.state === 'energized') return { text: `${DIR_GLYPH[v.dir]} ${DIR_WORD[v.dir]}`, cls: TONE_FILL[v.dir] };
  if (v.state === 'dim') return { text: 'sin señal', cls: 'fill-ink/25' };
  return { text: domain, cls: 'fill-ink/45' };
}

export interface NeuralGraphProps {
  layout: HeroLayout;
  agents: { a1: AgentVisual; a2: AgentVisual; a3: AgentVisual; est?: AgentVisual };
  debate: { settled: boolean };
  litRegions: Set<Region>;
  cableFlow: Record<Region, boolean>;
  resolved: boolean;
  breathing: boolean;
  reduced: boolean;
  displayPct: string;
  sublabel: string;
  numberClass: string;
  verdict: { dir: Dir; kappa: number | null } | null;
  ariaLabel: string;
}

export function NeuralGraph({
  layout,
  agents,
  debate,
  litRegions,
  cableFlow,
  resolved,
  breathing,
  reduced,
  displayPct,
  sublabel,
  numberClass,
  verdict,
  ariaLabel,
}: NeuralGraphProps) {
  const debX = layout.debate.x + layout.debate.w / 2;
  const debY = layout.debate.y + layout.debate.h / 2;
  const verX = layout.verdict.x + layout.verdict.w / 2;
  const verY = layout.verdict.y + layout.verdict.h / 2;

  return (
    <svg className="block w-full h-auto" viewBox={layout.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={ariaLabel}>
      {/* divisor del carril aislado de A3 */}
      <line
        className="stroke-ink/15"
        x1={layout.divider.x1}
        y1={layout.divider.y1}
        x2={layout.divider.x2}
        y2={layout.divider.y2}
        strokeWidth={1}
        strokeDasharray="3 6"
      />

      {/* cables (la pata de Estructura solo si está activa) */}
      {layout.cables.map((c) => {
        if (c.region === 'est' && !agents.est) return null;
        return <Cable key={c.region} d={c.d} plug={c.plug} flowing={cableFlow[c.region]} isolated={c.isolated} reduced={reduced} />;
      })}

      {/* chips + readouts */}
      {layout.chips.map((ch) => {
        const v = agents[ch.agent];
        if (!v) return null; // Estructura ausente (opt-in)
        const ro = readoutFor(v, AGENT_DOMAIN[ch.agent]);
        const id = ch.agent === 'est' ? 'AE' : ch.agent.toUpperCase();
        return (
          <g key={ch.agent}>
            <Chip cx={ch.cx} cy={ch.cy} id={id} state={v.state} isolated={ch.isolated} reduced={reduced} />
            <text className={cn('font-mono', ro.cls)} x={ch.cx} y={ch.readoutY} textAnchor="middle" fontSize={10}>
              {ro.text}
            </text>
          </g>
        );
      })}

      {/* nodo debate (condicional: se enciende solo si el debate corrió de verdad) */}
      <g style={{ opacity: debate.settled ? 1 : 0.36 }} className="transition-opacity duration-300">
        <rect
          className={cn('fill-accent/10 transition-[stroke] duration-300', debate.settled ? 'stroke-accent' : 'stroke-ink/20')}
          x={layout.debate.x}
          y={layout.debate.y}
          width={layout.debate.w}
          height={layout.debate.h}
          rx={7}
          strokeWidth={1}
        />
        <text className={cn('font-mono', debate.settled ? 'fill-ink' : 'fill-ink/45')} x={debX} y={debY + 4} textAnchor="middle" fontSize={11}>
          debate
        </text>
      </g>

      {/* núcleo cerebro */}
      <BrainCore
        litRegions={litRegions}
        resolved={resolved}
        breathing={breathing}
        reduced={reduced}
        displayPct={displayPct}
        sublabel={sublabel}
        numberClass={numberClass}
        transform={layout.brainTransform}
        transformOrigin={layout.brainOrigin}
      />
      <text className="font-mono fill-ink/28" x={layout.nucleoLabel.x} y={layout.nucleoLabel.y} textAnchor="middle" fontSize={10}>
        núcleo · A4
      </text>

      {/* veredicto (reveal real) */}
      {verdict && (
        <g className="transition-opacity duration-500">
          <rect className="fill-accent/15 stroke-accent" x={layout.verdict.x} y={layout.verdict.y} width={layout.verdict.w} height={layout.verdict.h} rx={6} strokeWidth={1} />
          <text className="font-mono" x={verX} y={verY + 4} textAnchor="middle" fontSize={12} fontWeight={500}>
            <tspan className={TONE_FILL[verdict.dir]}>
              {DIR_GLYPH[verdict.dir]} {DIR_WORD[verdict.dir]}
            </tspan>
            {verdict.kappa != null && (
              <>
                <tspan className="fill-ink/45"> · </tspan>
                <tspan className="fill-accent">κ {verdict.kappa}%</tspan>
              </>
            )}
          </text>
        </g>
      )}
    </svg>
  );
}
