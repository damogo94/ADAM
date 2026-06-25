'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { HeroFallback } from './hero-fallback';

/**
 * HeroArc — hero scroll-pinned de /inicio: arco narrativo de 5 capítulos.
 *
 * Sección alta (h-[500vh]) con un viewport STICKY: al hacer scroll, los 5
 * capítulos (El ruido → El veredicto) se cruzan en crossfade, el riel de
 * waypoints marca el activo, y el R3F detrás va de DIFUSO/ruido → RESUELTO
 * (la `resolution` deriva del scroll y se pasa a Hero3D).
 *
 * Honestidad: el motivo es abstracto ruido→señal, NO un análisis fingido —
 * ningún "completado" precede a su evento real (no hay evento; es ambiente).
 *
 * prefers-reduced-motion → versión estática apilada (sin pin, sin scrub) +
 * HeroFallback (sin canvas). Hero3D vía dynamic(ssr:false) → three/R3F solo aquí.
 */

const Hero3D = dynamic(() => import('./hero-3d').then((m) => m.Hero3D), {
  ssr: false,
  loading: () => <HeroFallback />,
});

interface Chapter {
  wp: string;
  title: string;
  giro: string;
}

const CHAPTERS: Chapter[] = [
  { wp: 'El ruido', title: 'Un ticker. Mil opiniones.', giro: 'Ninguna es, todavía, análisis.' },
  { wp: 'Los datos', title: 'Primero, los hechos.', giro: 'Precio, fundamentales y macro. Sin relato encima.' },
  {
    wp: 'Los agentes',
    title: 'Tres miradas, cada una a lo suyo.',
    giro: 'Y la técnica solo ve el precio —ni noticias ni opiniones— para no contaminarse.',
  },
  {
    wp: 'La confluencia',
    title: 'No te promediamos las lecturas.',
    giro: 'Las contrastamos entre sí; si chocan, se nota en la confianza.',
  },
  {
    wp: 'El veredicto',
    title: 'Una lectura clara, con su confianza.',
    giro: 'Sin fingir certezas que no existen.',
  },
];

const N = CHAPTERS.length;
const SEG = 1 / N;

function ChapterBlock({
  i,
  chapter,
  progress,
}: {
  i: number;
  chapter: Chapter;
  progress: MotionValue<number>;
}) {
  const start = i * SEG;
  const isFirst = i === 0;
  const isLast = i === N - 1;
  // crossfade: aparece al entrar en su segmento, se va antes del siguiente.
  // El primero arranca a tope (no fade-in en p=0); el último se sostiene hasta
  // el final del pin (no fade-out) → sin "cola" en blanco en los extremos.
  const inA = isFirst ? 0 : start - 0.06;
  const inB = isFirst ? 0.001 : start + 0.02;
  const outA = isLast ? 0.999 : start + SEG - 0.04;
  const outB = isLast ? 1 : start + SEG + 0.02;
  const opacity = useTransform(progress, [inA, inB, outA, outB], [isFirst ? 1 : 0, 1, 1, isLast ? 1 : 0]);
  const y = useTransform(progress, [inA, inB], [isFirst ? 0 : 24, 0]);
  return (
    <motion.div className="absolute inset-0" style={{ opacity, y }}>
      <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-accent">{chapter.wp}</p>
      <h2 className="mt-3 font-sans text-3xl font-bold leading-tight tracking-wide text-white md:text-4xl">
        {chapter.title}
      </h2>
      <p className="mt-3 max-w-md text-lg leading-relaxed text-white/70">{chapter.giro}</p>
    </motion.div>
  );
}

function Waypoint({ i, label, progress }: { i: number; label: string; progress: MotionValue<number> }) {
  const start = i * SEG;
  const opacity = useTransform(
    progress,
    [start - 0.04, start + 0.02, start + SEG - 0.02, start + SEG + 0.02],
    [0.3, 1, 1, 0.3]
  );
  const scaleX = useTransform(
    progress,
    [start - 0.04, start + 0.02, start + SEG - 0.02, start + SEG + 0.02],
    [0.4, 1, 1, 0.4]
  );
  return (
    <div className="flex items-center gap-2">
      <motion.span
        className="block h-[3px] w-6 origin-left rounded-full bg-accent"
        style={{ opacity, scaleX }}
      />
      <motion.span
        className="font-mono text-[11px] uppercase tracking-wider text-white/70"
        style={{ opacity }}
      >
        {label}
      </motion.span>
    </div>
  );
}

export function HeroArc() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Hooks SIEMPRE en el mismo orden: declara el scroll aunque reduce sea true.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const resolution = useTransform(scrollYProgress, [0, 0.85], [0, 1]);

  if (reduce) return <HeroArcStatic />;

  return (
    <section ref={ref} className="relative h-[500vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        {/* R3F detrás, a la derecha; no captura el scroll (pointer-events-none) */}
        <div className="pointer-events-none absolute right-0 top-1/2 h-[64vh] w-[min(92vw,560px)] -translate-y-1/2 md:right-[3%]">
          <Hero3D progress={resolution} />
        </div>

        <div className="relative mx-auto w-full max-w-5xl px-5">
          <div className="mb-8">
            <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-white/55">
              Anomaly Detection &amp; Analysis Module
            </p>
            <h1 className="mt-2 font-sans text-5xl font-extrabold tracking-[0.12em] text-white md:text-7xl">
              A.D.A.M.
            </h1>
          </div>

          {/* capítulos apilados (crossfade por scroll) */}
          <div className="relative h-[190px] max-w-xl">
            {CHAPTERS.map((c, i) => (
              <ChapterBlock key={c.wp} i={i} chapter={c} progress={scrollYProgress} />
            ))}
          </div>

          {/* riel de waypoints */}
          <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
            {CHAPTERS.map((c, i) => (
              <Waypoint key={c.wp} i={i} label={c.wp} progress={scrollYProgress} />
            ))}
          </div>

          {/* CTA persistente (único punto de conversión del hero) */}
          <Link
            href="/analysis"
            className="mt-10 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-80"
          >
            Abrir análisis
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Variante estática (reduced-motion): los 5 capítulos apilados, sin pin ni scrub. */
function HeroArcStatic() {
  return (
    <section className="mx-auto max-w-5xl px-5 pt-14 md:pt-20">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-white/55">
            Anomaly Detection &amp; Analysis Module
          </p>
          <h1 className="mt-2 font-sans text-5xl font-extrabold tracking-[0.12em] text-white md:text-6xl">
            A.D.A.M.
          </h1>
          <ol className="mt-8 space-y-5">
            {CHAPTERS.map((c) => (
              <li key={c.wp}>
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">{c.wp}</p>
                <p className="mt-1 font-sans text-xl font-bold tracking-wide text-white">{c.title}</p>
                <p className="text-white/65">{c.giro}</p>
              </li>
            ))}
          </ol>
          <Link
            href="/analysis"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-80"
          >
            Abrir análisis
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="relative mx-auto h-[280px] w-full max-w-[420px] md:h-[420px]">
          <HeroFallback />
        </div>
      </div>
    </section>
  );
}
