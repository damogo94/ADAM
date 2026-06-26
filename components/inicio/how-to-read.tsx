'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Reveal } from './decor/reveal';
import { Eyebrow } from './section-heading';
import { EXAMPLE } from './example';
import { toneFor } from './lib/tone';
import { formatKappa } from './lib/format';

/**
 * HowToRead — "Cómo se ve un análisis": sección didáctica que enseña a LEER el
 * veredicto (el instrumento manipulable vive en el hero; aquí no se duplica).
 * Las tres métricas clave del escenario por defecto se revelan con montaje
 * cinematográfico + un barrido (scanline) de calibración al entrar en vista, y
 * un desplegable explica accionable/κ/confluencia. reduced-motion → sin barrido.
 */
export function HowToRead() {
  const reduce = useReducedMotion();
  const v = EXAMPLE.verdict;
  const tone = toneFor(v.direccion);

  const metrics = [
    {
      label: 'Confianza accionable',
      value: String(v.actionable_pct),
      valueClass: tone.text,
      def: 'Cuánto fiarte del resultado, de 0 a 100. Combina la fuerza de la señal con cuánto coinciden los agentes.',
    },
    {
      label: 'κ coincidencia',
      value: formatKappa(v.kappa),
      valueClass: 'text-ink',
      def: 'Cuánto se confirman entre sí las tres lecturas, de 0 a 1. Si chocan, baja.',
    },
    {
      label: 'Confluencia',
      value: String(v.confluence_pct),
      valueClass: 'text-ink',
      def: 'El respaldo conjunto de la conclusión. Umbrales: ≥67 alta · ≥34 media · <34 baja.',
    },
  ];

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
              Cómo leer un veredicto.
            </h2>
            <p className="mt-4 max-w-xl text-fluid-lead leading-[1.55] text-ink/72">
              Tres números resumen toda la lectura. No necesitas dominar cada término: aquí tienes
              qué significan y cómo se relacionan.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/[0.08] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-amber">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
            Ejemplo ilustrativo
          </span>
        </div>
      </Reveal>

      {/* montaje: tarjeta con barrido de calibración (scanline) al entrar */}
      <div className="relative overflow-hidden rounded-card border border-ink/10 bg-surface shadow-e2 edge-hi">
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
          {metrics.map((m, i) => (
            <Reveal key={m.label} delay={0.12 + i * 0.14}>
              <div className="flex h-full flex-col bg-surface px-6 py-6">
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-ink/45">
                  {m.label}
                </span>
                <span className={cn('mt-2 font-mono text-3xl font-semibold', m.valueClass)}>
                  {m.value}
                </span>
                <p className="mt-3 text-[0.86rem] leading-relaxed text-ink/58">{m.def}</p>
              </div>
            </Reveal>
          ))}
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
