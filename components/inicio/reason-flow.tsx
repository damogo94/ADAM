'use client';

import { useRef } from 'react';
import { useInView } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Reveal } from './decor/reveal';
import { SectionHeading } from './section-heading';
import { EXAMPLE } from './example';
import { toneFor } from './lib/tone';
import { formatKappa } from './lib/format';

/**
 * ReasonFlow — "Cómo razona": el pipeline hecho diagrama. Datos en crudo → dos
 * carriles contrastados (el código CALCULA | la IA NARRA) → veredicto. Hace
 * visible el determinismo. Las flechas llevan "marching-ants" en accent que solo
 * corren mientras la sección está en viewport (ahorra INP).
 */
function Connector({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center self-center max-[860px]:rotate-90"
    >
      <svg width="44" height="12" viewBox="0 0 44 12" fill="none">
        <line
          x1="0"
          y1="6"
          x2="34"
          y2="6"
          stroke="var(--accent)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          className={active ? 'animate-dash-flow' : undefined}
        />
        <path
          d="M32 2 L38 6 L32 10"
          stroke="var(--accent)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function ReasonFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const v = EXAMPLE.verdict;
  const tone = toneFor(v.direccion);

  return (
    <section aria-labelledby="razona-title" className="mx-auto w-full max-w-6xl px-5 sm:px-10">
      <Reveal className="mb-10">
        <SectionHeading
          id="razona-title"
          eyebrow="Cómo razona"
          title="La inteligencia explica. El código calcula."
          sub="Dos trabajos distintos, separados a propósito. Por eso, con los mismos datos, el resultado es siempre el mismo."
        />
      </Reveal>

      <Reveal>
        <div ref={ref} className="flex items-stretch gap-4 max-[860px]:flex-col">
          {/* Datos en crudo */}
          <div className="flex min-w-[160px] flex-col justify-center gap-2 rounded-xl border border-ink/10 bg-surface-2 p-5 edge-hi">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.13em] text-ink/58">
              Datos en crudo
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {['Finnhub', 'Yahoo', 'FRED'].map((s) => (
                <span
                  key={s}
                  className="rounded border border-ink/10 bg-surface px-1.5 py-0.5 text-[0.68rem] text-ink/72"
                >
                  {s}
                </span>
              ))}
            </div>
            <p className="text-[0.82rem] leading-snug text-ink/58">Precio, fundamentales y macro. Sin interpretar.</p>
          </div>

          <Connector active={inView} />

          {/* Dos carriles */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="graticule-bg-fine rounded-xl border border-ink/10 bg-surface p-5">
              <span className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.13em] text-ink/58">
                <span className="inline-block h-2 w-2 border border-accent/40" />
                El código · calcula
              </span>
              <p className="mt-2 text-[0.82rem] leading-snug text-ink/58">
                Indicadores, niveles, κ y confianza: los computa código determinista.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip label="confluencia" value={v.confluence_pct} />
                <Chip label="κ" value={formatKappa(v.kappa)} />
                <Chip label="accionable" value={v.actionable_pct} />
              </div>
              <span className="mt-3 block font-mono text-[0.62rem] tracking-[0.03em] text-ink/40">
                mismos datos → mismo resultado
              </span>
            </div>

            <div className="rounded-xl border border-ink/10 border-l-2 border-l-accent/40 bg-surface p-5">
              <span className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.13em] text-ink/58">
                <span className="inline-block h-2 w-2 rounded-full border border-accent/40" />
                La IA · narra
              </span>
              <p className="mt-2 text-[0.82rem] leading-snug text-ink/58">
                Los modelos Claude ponen en palabras lo que los números ya dicen.
              </p>
              <p className="mt-3 text-[0.9rem] italic leading-relaxed text-ink/72">
                «Caja sólida y catalizador de servicios; el mercado infravalora el ciclo de recompras.»
              </p>
            </div>
          </div>

          <Connector active={inView} />

          {/* Veredicto */}
          <div
            className={cn(
              'flex min-w-[160px] flex-col justify-center gap-2 rounded-xl border p-5',
              tone.panelBorder,
              tone.panelBg,
            )}
          >
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.13em] text-ink/58">
              Veredicto
            </span>
            <span className={cn('text-[1.05rem] font-bold', tone.text)}>
              <span aria-hidden="true">{tone.glyph}</span> {tone.word}
            </span>
            <span className="font-mono text-[0.78rem] text-ink/58">
              {v.actionable_pct} · {v.nivel}
            </span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-md border border-ink/10 bg-surface-2 px-2 py-0.5 text-[0.78rem] text-ink/72">
      {label}&nbsp;<b className="font-semibold text-ink">{value}</b>
    </span>
  );
}
