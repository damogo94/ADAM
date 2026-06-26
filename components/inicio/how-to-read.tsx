'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Reveal } from './decor/reveal';
import { Eyebrow } from './section-heading';
import { SCENARIOS } from './example';
import { toneFor } from './lib/tone';
import { capitalize, formatKappa } from './lib/format';
import { Gauge } from './gauge';

/**
 * HowToRead — "Cómo se ve un análisis": sección didáctica (el instrumento
 * manipulable vive en el hero; aquí no se duplica).
 *
 * F · Comparador: los TRES escenarios lado a lado (71 / 24 / 34) para ver de un
 * vistazo que la confianza NO es fija — se calibra según cuánto coincidan las
 * lecturas. Los gauges cuentan al entrar en vista, con un barrido (scanline) de
 * calibración. Un desplegable explica accionable/κ/confluencia.
 * reduced-motion → sin barrido ni count-up (estado final directo).
 */
export function HowToRead() {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true, amount: 0.4 });

  return (
    <section
      id="ejemplo"
      aria-labelledby="ejemplo-title"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 sm:px-10"
    >
      <Reveal className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <Eyebrow>Cómo se ve un análisis</Eyebrow>
            <h2
              id="ejemplo-title"
              className="mt-4 font-sans text-fluid-h2 font-bold tracking-[-0.015em] text-ink"
            >
              La confianza no es fija.
            </h2>
            <p className="mt-4 max-w-xl text-fluid-lead leading-[1.55] text-ink/72">
              La misma máquina, tres veredictos. La confianza se calibra según cuánto coincidan las
              lecturas — y eso es justo lo que A.D.A.M. te dice.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/[0.08] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-amber">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
            Ejemplo ilustrativo
          </span>
        </div>
      </Reveal>

      {/* F · comparador de los 3 escenarios — barrido de calibración al entrar */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-card border border-ink/10 bg-surface shadow-e2 edge-hi"
      >
        {!reduce ? (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
            initial={{ top: '0%', opacity: 0 }}
            whileInView={{ top: ['0%', '100%'], opacity: [0, 1, 0] }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.2, ease: 'easeInOut', times: [0, 0.5, 1] }}
          />
        ) : null}

        <div className="grid gap-px bg-ink/10 sm:grid-cols-3">
          {SCENARIOS.map((s, i) => {
            const tone = toneFor(s.verdict.direccion);
            const label = s.verdict.direccion_label ?? capitalize(s.verdict.direccion);
            return (
              <Reveal key={s.id} delay={0.12 + i * 0.12}>
                <div className="flex h-full flex-col items-center gap-3 bg-surface px-6 py-7 text-center">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-ink/15 bg-surface-2 px-2 py-0.5 font-mono text-[0.8rem] font-semibold tracking-[0.1em]">
                      {s.ticker}
                    </span>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-ink/45">
                      {s.tabLabel}
                    </span>
                  </div>
                  <Gauge value={s.verdict.actionable_pct} hex={tone.hex} replay={inView ? 1 : 0} />
                  <span className={cn('inline-flex items-center gap-1.5 text-[0.95rem] font-bold', tone.text)}>
                    <span aria-hidden="true">{tone.glyph}</span>
                    {label}
                  </span>
                  <span className="font-mono text-[0.7rem] text-ink/45">
                    κ {formatKappa(s.verdict.kappa)}
                  </span>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      <details className="group mt-5 rounded-xl border border-ink/10 bg-surface-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-mono text-[0.78rem] tracking-[0.03em] text-ink/72 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="font-bold text-accent transition-transform group-open:rotate-45">+</span>
          Cómo leer este veredicto
        </summary>
        <div className="grid gap-3 px-5 pb-5">
          <p className="text-[0.86rem] leading-relaxed text-ink/58">
            <b className="font-semibold text-ink">Confianza accionable</b> — cuánto fiarte del
            resultado, de 0 a 100. Combina la fuerza de la señal con cuánto coinciden los agentes.
          </p>
          <p className="text-[0.86rem] leading-relaxed text-ink/58">
            <b className="font-semibold text-ink">κ (coincidencia)</b> — cuánto se confirman entre sí
            las tres lecturas, de 0 a 1. Si chocan, baja.
          </p>
          <p className="text-[0.86rem] leading-relaxed text-ink/58">
            <b className="font-semibold text-ink">Confluencia</b> — el respaldo conjunto de la
            conclusión. Umbrales: ≥67 alta · ≥34 media · &lt;34 baja.
          </p>
        </div>
      </details>

      <p className="mt-4 font-mono text-[0.7rem] tracking-[0.03em] text-ink/45">
        Cifras de muestra para enseñar el formato · no es una recomendación · prueba el conmutador de
        arriba para ver cómo se mueve la confianza.
      </p>
    </section>
  );
}
