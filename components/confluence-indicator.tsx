import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ConfluenceResult } from '@/lib/confluence';
import { Gauge } from '@/components/inicio/gauge';
import { Glossed } from '@/components/lens/glossed';

interface ConfluenceIndicatorProps {
  data: ConfluenceResult | null;
}

/**
 * Titular del rail: el MISMO dial radial que /inicio (`Gauge`), para amarrar
 * /analysis al lenguaje visual del landing. Cifra = FIABILIDAD
 * (|net|×f(κ)); κ se muestra como eje propio debajo; la desagregación por pares
 * va al pie.
 *
 * FIREWALL: este arco va en ACCENT (chrome), NO en emerald/rose. Mide
 * confianza/alineación entre agentes, no DIRECCIÓN — la dirección la lleva el
 * VerdictBar (ahí sí market-color). Mismo criterio que el ConfidenceChip.
 *
 * La intensidad de blanco (55/70/100%) comunica el nivel en la desagregación;
 * el piso es 55% (no 40%) para no caer bajo el umbral de contraste AA.
 */
export function ConfluenceIndicator({ data }: ConfluenceIndicatorProps) {
  // Fase 1 · ejes separados: la cifra grande es la FIABILIDAD; nivel y
  // tono derivan de actionable. Null-guard: datos sin ejes nuevos caen al
  // total_pct viejo. (Sin análisis → dial en reposo "—", sin nivel fantasma.)
  const actionable = Math.max(0, Math.min(100, data?.actionable_pct ?? data?.total_pct ?? 0));
  const kappa = data?.kappa ?? null;
  const level = data && actionable > 0 ? labelFromScore(actionable) : null;

  return (
    <div className="rounded-card-sm border border-white/5 bg-surface-2 px-3.5 py-3 transition-all duration-500">
      <div className="font-sans text-fluid-micro font-bold tracking-[0.1em] text-ink mb-0.5"><Glossed term="fiabilidad">FIABILIDAD</Glossed></div>
      <div className="font-mono text-fluid-micro text-ink/66 mb-3">fuerza direccional ajustada por coincidencia</div>

      {/* Titular = dial radial (mismo componente que /inicio), en accent. */}
      <div className="mb-3 flex flex-col items-center gap-2 rounded-[11px] border border-white/8 bg-white/[0.015] px-2 py-3">
        <div
          aria-live="polite"
          aria-label={level === null ? 'fiabilidad: en espera' : `fiabilidad: ${actionable}%`}
        >
          {data && actionable > 0 ? (
            <Gauge value={actionable} hex="var(--accent)" restless={level === 'baja'} />
          ) : (
            <IdleDial />
          )}
        </div>
        <div className="font-mono text-fluid-micro uppercase tracking-wider text-ink/55">
          {level === null ? 'en espera' : `nivel · ${level}`}
        </div>

        {/* κ — eje de coincidencia, dedicado. Oculto si no hay ejes nuevos. */}
        {kappa !== null && (
          <div className="flex w-full items-center justify-center gap-1.5 border-t border-white/5 pt-2">
            <span className="font-mono text-fluid-micro uppercase tracking-wider text-ink/55"><Glossed term="coincidencia">κ coincidencia</Glossed></span>
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    i <= Math.round(kappa * 5) ? 'bg-accent' : 'bg-white/15'
                  )}
                />
              ))}
            </span>
            <span className="font-mono text-fluid-micro tabular-nums text-ink/66">{Math.round(kappa * 100)}%</span>
          </div>
        )}
      </div>

      {/* Desagregación por pares — la intensidad de blanco comunica el nivel. */}
      <div className="flex flex-col gap-2">
        <ConfluenceRow
          label="A3 solo"
          score={data?.a3_solo.score ?? 0}
          rightLabel={data ? labelFromScore(data.a3_solo.score) : '—'}
          rightCls={data ? intensityFromScore(data.a3_solo.score) : 'text-ink/66'}
        />
        <ConfluenceRow
          label="A1 + A2"
          score={data?.a1_a2.score ?? 0}
          rightLabel={data ? labelFromScore(data.a1_a2.score) : '—'}
          rightCls={data ? intensityFromScore(data.a1_a2.score) : 'text-ink/66'}
        />
        {/* Estructura — solo cuando el usuario activó el agente (opt-in). */}
        {data?.estructura && (
          <ConfluenceRow
            label="Estructura"
            score={data.estructura.score}
            rightLabel={labelFromScore(data.estructura.score)}
            rightCls={intensityFromScore(data.estructura.score)}
          />
        )}
        <ConfluenceRow
          label={<Glossed term="confluencia">Confluencia</Glossed>}
          score={data?.alineados.score ?? 0}
          rightLabel={data ? labelFromPct(data.total_pct) : '—'}
          rightCls={data ? intensityFromPct(data.total_pct) : 'text-ink/66'}
        />
      </div>
    </div>
  );
}

/** Dial en reposo (sin análisis): aro tenue + "—". Mismas medidas que Gauge. */
function IdleDial() {
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true">
        <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(245,245,247,.10)" strokeWidth="6" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-semibold leading-none text-ink/35">—</span>
        <span className="mt-[3px] font-mono text-[0.56rem] uppercase tracking-[0.12em] text-ink/50">fiabilidad</span>
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
  label: ReactNode;
  score: number;
  rightLabel: string;
  rightCls: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-fluid-caption text-ink/70 w-[68px] flex-shrink-0">{label}</span>
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
      <span className={cn('ml-auto font-mono text-fluid-caption text-right min-w-[48px] tabular-nums', rightCls)}>
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
  if (s >= 67) return 'text-ink';
  if (s >= 34) return 'text-ink/70';
  return 'text-ink/66';
}
function intensityFromPct(p: number): string {
  if (p >= 67) return 'text-ink';
  if (p >= 34) return 'text-ink/70';
  return 'text-ink/66';
}
