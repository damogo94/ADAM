'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Graticule } from './decor/graticule';
import { Instrument } from './instrument';
import { arw, btnBase, btnGhost, btnPrimary } from './lib/ui';

/**
 * Hero — fold de /inicio. IZQUIERDA: copy + CTA (orden de lectura y tabulación
 * primero, valor→CTA→instrumento). DERECHA: el Instrument manipulable.
 *
 * LCP-safe: el h1 y la card NO animan opacidad (entran a opacity:1); solo el
 * copy secundario hace fade+rise escalonado en carga. reduced-motion → estático.
 */
const EASE = [0.22, 0.61, 0.36, 1] as const;

function FadeUp({
  children,
  delay,
  className,
  reduce,
}: {
  children: React.ReactNode;
  delay: number;
  className?: string;
  reduce: boolean | null;
}) {
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section
      aria-labelledby="hero-title"
      className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-10 sm:px-10 md:pb-24 md:pt-16"
    >
      <Graticule parallax />
      <div className="relative z-10 grid items-center gap-10 md:gap-14 lg:grid-cols-[1.04fr_0.96fr]">
        {/* IZQUIERDA — copy */}
        <div className="max-w-xl">
          <FadeUp delay={0.05} reduce={reduce}>
            <p className="inline-flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-ink/58 before:h-px before:w-[18px] before:bg-accent/80 before:content-['']">
              Copiloto de análisis · multiagente
            </p>
          </FadeUp>

          {/* h1: solo transform (LCP-safe), opacidad siempre 1 */}
          {reduce ? (
            <h1 id="hero-title" className="mt-5 font-sans text-fluid-display font-extrabold tracking-[-0.025em] text-ink">
              Un activo. Tres lecturas.
              <br />
              Un veredicto con su <Confianza />.
            </h1>
          ) : (
            <motion.h1
              id="hero-title"
              className="mt-5 font-sans text-fluid-display font-extrabold tracking-[-0.025em] text-ink"
              initial={{ y: 12 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              Un activo. Tres lecturas.
              <br />
              Un veredicto con su <Confianza />.
            </motion.h1>
          )}

          <FadeUp delay={0.13} reduce={reduce}>
            <p className="mt-6 max-w-lg text-fluid-lead leading-[1.55] text-ink/72">
              Escribes un ticker —AAPL, Bitcoin— y A.D.A.M. lo examina desde tres ángulos: las
              cuentas de la empresa, el contexto macro y el precio. Reúne las tres en una conclusión
              clara y te dice cuánto fiarte de ella. Educativo — nunca tu broker.
            </p>
          </FadeUp>

          <FadeUp delay={0.21} reduce={reduce} className="mt-8 flex flex-wrap gap-3">
            <Link href="/analysis" className={cn(btnBase, btnPrimary)}>
              Analiza un ticker
              <span aria-hidden="true" className={arw}>
                →
              </span>
            </Link>
            <a href="#como" className={cn(btnBase, btnGhost)}>
              Ver cómo funciona
            </a>
          </FadeUp>

          <FadeUp delay={0.29} reduce={reduce}>
            <div
              className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-fluid-caption tracking-[0.06em] text-ink/45"
              aria-label="Cómo está construido"
            >
              <span>
                <span className="mr-1.5 inline-block h-1 w-1 rounded-full bg-accent/70 align-middle" />
                <span className="text-ink/58">DATOS EN CRUDO</span> · FINNHUB · YAHOO · FRED
              </span>
              <span>
                <span className="text-ink/58">EL CÓDIGO CALCULA</span> · LA IA NARRA
              </span>
            </div>
          </FadeUp>
        </div>

        {/* DERECHA — el instrumento */}
        <div className="w-full">
          <Instrument />
        </div>
      </div>
    </section>
  );
}

/** "confianza" resaltada con un realce de acento (marca, no market-color). */
function Confianza() {
  return (
    <span className="relative whitespace-nowrap text-ink">
      <span className="relative z-10">confianza</span>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[0.08em] z-0 h-[0.5em] rounded-[3px] bg-accent/15"
      />
    </span>
  );
}
