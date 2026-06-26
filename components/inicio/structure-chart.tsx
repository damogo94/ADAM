'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Reveal } from './decor/reveal';
import { Graticule } from './decor/graticule';
import { Eyebrow } from './section-heading';
import { TONE } from './lib/tone';
import { arw, btnBase, btnGhost } from './lib/ui';

/**
 * StructureChart — "Agente de Estructura" (módulo opt-in para futuros). Gráfico
 * SVG de la estrategia: retroceso a zona clave → entrada/stop/objetivo con
 * bandas R/B. El trazo del precio se DIBUJA al entrar en vista y los niveles
 * aparecen en secuencia. Colores de mercado (objetivo=emerald, stop=rose) =
 * datos de nivel (legales); la zona clave usa accent (chrome). reduced-motion →
 * estático.
 */
const EASE = [0.22, 0.61, 0.36, 1] as const;

export function StructureChart() {
  const reduce = useReducedMotion();
  const up = TONE.up.hex;
  const down = TONE.down.hex;

  return (
    <section aria-labelledby="estructura-title" className="mx-auto w-full max-w-6xl px-5 sm:px-10">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-gradient-to-br from-surface to-void p-6 sm:p-10 md:p-12 edge-hi">
          <Graticule className="opacity-[0.45]" />
          <div className="relative z-10 grid items-center gap-10 md:gap-12 lg:grid-cols-[0.92fr_1.08fr]">
            {/* copy */}
            <div className="max-w-xl">
              <Eyebrow>Además · para futuros</Eyebrow>
              <h2
                id="estructura-title"
                className="mt-4 font-sans text-fluid-h2 font-bold tracking-[-0.015em] text-ink"
              >
                Agente de Estructura
              </h2>
              <p className="mt-4 text-fluid-lead leading-[1.55] text-ink/72">
                Un módulo aparte, para quien opera futuros (oro, índices, divisas). Lee la estructura
                del precio en varias escalas de tiempo —de la semanal a la de una hora— y espera a que
                vuelva a un nivel clave. Cuando ese punto coincide con una zona importante, propone por
                dónde entrar, hasta dónde arriesgar y qué objetivo buscar —siempre con más beneficio
                potencial que riesgo. Mecánico y transparente, sin caja negra.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {['XAUUSD', 'NAS100', 'US500'].map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-ink/15 bg-surface-2 px-2.5 py-1 font-mono text-[0.74rem] tracking-[0.06em] text-ink/72"
                  >
                    {s}
                  </span>
                ))}
                <span className="self-center font-mono text-[0.72rem] text-ink/45">
                  → lo traduce al contrato correcto
                </span>
              </div>
              <Link href="/estructura" className={cn(btnBase, btnGhost, 'mt-8')}>
                Abrir Estructura
                <span aria-hidden="true" className={arw}>
                  →
                </span>
              </Link>
            </div>

            {/* gráfico */}
            <figure className="m-0 min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[0.68rem] tracking-[0.03em] text-ink/58">
                <span>Semanal · define la zona</span>
                <span className="text-ink/30">›</span>
                <span>4H · contexto</span>
                <span className="text-ink/30">›</span>
                <span className="text-accent">1H · ejecuta</span>
              </div>
              <svg
                viewBox="0 0 580 300"
                className="block h-auto w-full rounded-lg border border-ink/10 bg-void [&_text]:font-mono"
                role="img"
                aria-label="Gráfico de ejemplo de la estrategia: el precio retrocede a una zona clave y rebota. Entrada en 212, stop en 203 y objetivo en 234, con una relación beneficio-riesgo de 2,4 a 1."
              >
                {/* zona clave (accent) */}
                <rect x="36" y="171" width="430" height="28" fill="var(--accent)" fillOpacity="0.16" />
                <line x1="36" y1="185" x2="466" y2="185" stroke="var(--accent)" strokeOpacity="0.32" strokeDasharray="2 4" />
                <text x="44" y="166" fontSize="10" letterSpacing="0.03em" fill="rgba(245,245,247,.58)">
                  zona clave · retesteo
                </text>
                {/* bandas objetivo / stop (mercado) */}
                <rect x="312" y="88" width="154" height="97" fill={up} fillOpacity="0.10" />
                <rect x="312" y="185" width="154" height="43" fill={down} fillOpacity="0.10" />
                <line x1="36" y1="88" x2="466" y2="88" stroke={up} strokeOpacity="0.32" strokeDasharray="3 4" />
                <line x1="36" y1="228" x2="466" y2="228" stroke={down} strokeOpacity="0.34" strokeDasharray="3 4" />
                {/* trazo del precio — draw-on */}
                <motion.path
                  d="M36,160 C84,150 104,116 150,108 C196,100 214,134 250,156 C282,174 296,185 312,185 C346,182 380,150 410,128 C436,112 452,108 466,102"
                  fill="none"
                  stroke="rgba(245,245,247,.9)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  initial={reduce ? { strokeDashoffset: 0 } : { strokeDashoffset: 1 }}
                  whileInView={{ strokeDashoffset: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 1.4, ease: EASE }}
                />
                {/* punto de entrada */}
                <motion.g
                  initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.4, delay: reduce ? 0 : 1.0 }}
                >
                  <circle cx="312" cy="185" r="4.5" fill="var(--accent)" />
                  <circle cx="312" cy="185" r="9.5" fill="none" stroke="var(--accent)" strokeOpacity="0.32" />
                </motion.g>
                {/* etiquetas de nivel (mercado) */}
                <motion.g
                  initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.4, delay: reduce ? 0 : 1.15 }}
                >
                  <text x="474" y="92" fontSize="12" fontWeight="600" fill={up}>
                    Objetivo 234
                  </text>
                  <text x="474" y="189" fontSize="12" fontWeight="600" fill="rgba(245,245,247,.92)">
                    Entrada 212
                  </text>
                  <text x="474" y="232" fontSize="12" fontWeight="600" fill={down}>
                    Stop 203
                  </text>
                  <text x="320" y="80" fontSize="11" fontWeight="600" fill="rgba(245,245,247,.72)" letterSpacing="0.05em">
                    R/B 2,4 : 1
                  </text>
                </motion.g>
              </svg>
              <figcaption className="mt-5 grid gap-3">
                {[
                  'Espera el retroceso a la zona —no persigue el precio.',
                  'Confirma que la zona coincide en varias escalas de tiempo.',
                  'Entra solo si el beneficio potencial supera al riesgo.',
                ].map((step, i) => (
                  <span key={i} className="flex items-start gap-3 text-[0.84rem] leading-snug text-ink/72">
                    <b className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-accent/40 font-mono text-[0.72rem] text-accent">
                      {i + 1}
                    </b>
                    <span>{step}</span>
                  </span>
                ))}
              </figcaption>
            </figure>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
