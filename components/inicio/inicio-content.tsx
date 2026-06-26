'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { AuroraBackground } from './aurora-background';
import { HeroArc } from './hero-arc';
import { EXAMPLE } from './example';

/**
 * InicioContent — landing scroll-driven de A.D.A.M. (island cliente de /inicio).
 *
 * Pieza central: un EJEMPLO ILUSTRATIVO (no datos reales — cifras de muestra,
 * etiquetado visiblemente) que cuenta la historia en una frase: escribes un
 * ticker → ADAM cruza fundamental + macro + técnico → veredicto de confluencia
 * con su nivel de confianza y el porqué. Sustituye al antiguo pipeline paso a
 * paso (eliminado).
 *
 * Fondo aurora (AuroraBackground) detrás de todo, evoluciona con el scroll.
 * El hero es el arco narrativo scroll-pinned de 5 capítulos (HeroArc), que
 * encapsula el R3F (dynamic ssr:false) y su fallback reduced-motion.
 *
 * Copy/posicionamiento derivado del repo (README, CONTEXT, DISCLAIMER_LITERAL,
 * agents/shared/atlas-capital-style.ts).
 */

const NO_OFRECE = [
  'No es asesoramiento financiero personalizado.',
  'No ejecuta operaciones ni mueve tu capital. A.D.A.M. nunca es tu broker.',
  'No garantiza resultados ni predice el futuro.',
  'No sustituye a un asesor profesional certificado.',
] as const;

// Separador U+00B7 — debe coincidir con DISCLAIMER_LITERAL (agents/shared/types.ts).
const DISCLAIMER = 'Análisis educativo · no constituye asesoramiento financiero regulado';

/** Reveal on-scroll. Con prefers-reduced-motion se renderiza estático. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-white/66">{eyebrow}</p>
      <h2 className="mt-2 font-sans text-2xl font-bold tracking-wide text-white md:text-3xl">
        {title}
      </h2>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 min-w-[2.75rem] flex-shrink-0 items-center justify-center rounded border border-white/15 bg-white/[0.04] px-1.5 font-mono text-[12px] font-bold tracking-wider text-white/80">
      {children}
    </span>
  );
}

/** Etiqueta inequívoca de que el ejemplo NO son datos reales. */
function IllustrativeTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/[0.08] px-2.5 py-1 font-mono text-[12px] font-semibold uppercase tracking-wider text-amber">
      <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
      Ejemplo ilustrativo
    </span>
  );
}

/**
 * Roster (voz educativa). Diferenciado por TIPOGRAFÍA, no color: A3 lleva el
 * tratamiento "aislado" (borde discontinuo + etiqueta) reforzando el invariante
 * de aislamiento en la UI; CMT ocupa fila completa (vigía autónomo, no analista
 * por-ticker). Sin hues por agente (firewall + tipográfica-no-cromática).
 */
const ROSTER = [
  {
    tag: 'A1',
    role: 'Fundamental',
    line: 'Mira las cuentas de la empresa: si gana dinero y si está cara o barata. Sin dejarse llevar por la moda del momento.',
  },
  {
    tag: 'A2',
    role: 'Macro',
    line: 'Lee el contexto económico —tipos de interés, inflación, ciclo— que empuja o frena a todo el mercado a la vez.',
  },
  {
    tag: 'A3',
    role: 'Técnico',
    line: 'Mira solo el gráfico del precio. Ni noticias ni opiniones: aislado a propósito, para que nada lo contamine.',
    isolated: true,
  },
  {
    tag: 'A4',
    role: 'El que decide',
    line: 'No es un agente más: reúne las tres lecturas en una sola conclusión. Y cuando no coinciden, lo resuelve a la vista.',
  },
  {
    tag: 'CMT',
    role: 'Vigía',
    line: 'Vigila tu lista de seguimiento y te avisa cuando algo se mueve, sin que tengas que estar pendiente. Y sin coste.',
    span: true,
  },
] as const;

export function InicioContent() {
  const v = EXAMPLE.verdict;

  return (
    <>
      <AuroraBackground />
      {/* overflow-x-CLIP (no -hidden): recorta horizontal sin crear un scroll
          container, que rompería el `position: sticky` del hero scroll-pinned. */}
      <main className="relative min-h-screen overflow-x-clip pb-28">
        {/* ── 1 · Hero — arco narrativo scroll-pinned (5 capítulos) ───── */}
        <HeroArc />

        {/* ── 2 · Roster — quién mira y quién decide ─────────────────── */}
        <section className="mx-auto max-w-3xl px-5 pt-24">
          <Reveal>
            <SectionHeading eyebrow="El sistema" title="Quién mira y quién decide" />
          </Reveal>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROSTER.map((r, i) => {
              const isolated = 'isolated' in r && r.isolated;
              const span = 'span' in r && r.span;
              return (
                <Reveal key={r.tag} delay={i * 0.05} className={span ? 'sm:col-span-2' : undefined}>
                  <div
                    className={
                      'flex h-full items-start gap-3 rounded-xl border p-4 ' +
                      (isolated
                        ? 'border-dashed border-white/35 bg-white/[0.04]'
                        : 'border-white/10 bg-white/[0.03]')
                    }
                  >
                    <Badge>{r.tag}</Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white">{r.role}</h3>
                        {isolated && (
                          <span className="rounded bg-white/15 px-1 py-px font-mono text-[10px] font-bold uppercase tracking-wider text-white/80">
                            aislado
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-white/66">{r.line}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ── 3 · El motor: Claude / la cuenta: código ───────────────── */}
        <section className="mx-auto max-w-3xl px-5 pt-24">
          <Reveal>
            <SectionHeading eyebrow="Cómo razona" title="La inteligencia explica. El código calcula." />
            <p className="max-w-2xl text-lg leading-relaxed text-white/75">
              Cada agente usa inteligencia artificial (los modelos Claude) para una sola cosa:
              explicarte en palabras lo que ve. Los cálculos —los indicadores, los niveles, la
              confianza— los hace <strong className="font-semibold text-white">código</strong>, no
              la IA. ¿La ventaja? Con los mismos datos, el resultado es siempre el mismo: no depende
              de la inspiración del momento.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
              Y los datos llegan en crudo del mercado, sin intermediarios: precios y fundamentales
              de Finnhub y Yahoo, y el contexto macroeconómico de la Reserva Federal de EE. UU. (FRED).
            </p>
          </Reveal>
        </section>

        {/* ── 4 · Ejemplo ilustrativo (prueba) ──────────────────────── */}
        <section id="ejemplo" className="mx-auto max-w-4xl px-5 pt-24 scroll-mt-20">
          <Reveal>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.25em] text-white/66">
                  Cómo se ve un análisis
                </p>
                <h2 className="mt-2 font-sans text-2xl font-bold tracking-wide text-white md:text-3xl">
                  Un activo, tres lecturas, una conclusión
                </h2>
              </div>
              <IllustrativeTag />
            </div>
          </Reveal>

          <Reveal delay={0.03}>
            <p className="mb-6 max-w-2xl text-sm leading-relaxed text-white/60">
              Cada especialista te enseña sus datos y su lectura en una frase. No necesitas dominar
              cada término: el sistema los reúne por ti en una conclusión clara.
            </p>
          </Reveal>

          {/* Input → ticker */}
          <Reveal delay={0.05}>
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <span className="font-mono text-[12px] uppercase tracking-wider text-white/66">
                Escribes
              </span>
              <span className="rounded-md border border-white/20 bg-white/[0.06] px-3 py-1 font-mono text-base font-bold tracking-widest text-white">
                {EXAMPLE.ticker}
              </span>
              <span className="ml-auto font-mono text-xs text-white/66">
                {EXAMPLE.price.current} {EXAMPLE.price.currency} ·{' '}
                <span className="text-emerald">+{EXAMPLE.price.change_pct_24h}%</span>
              </span>
            </div>
          </Reveal>

          {/* Tres lecturas */}
          <div className="grid gap-3 md:grid-cols-3">
            {EXAMPLE.lenses.map((lens, i) => (
              <Reveal key={lens.tag} delay={0.1 + i * 0.05}>
                <div
                  className={
                    'flex h-full flex-col rounded-xl border p-4 ' +
                    (lens.isolated
                      ? 'border-dashed border-white/35 bg-white/[0.04]'
                      : 'border-white/10 bg-white/[0.03]')
                  }
                >
                  <div className="flex items-center gap-2">
                    <Badge>{lens.tag}</Badge>
                    <span className="font-mono text-xs font-medium uppercase tracking-wider text-white/80">
                      {lens.label}
                    </span>
                    {lens.isolated && (
                      <span className="ml-auto rounded bg-white/15 px-1 py-px font-mono text-[10px] font-bold uppercase tracking-wider text-white/80">
                        aislado
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {lens.points.map((p) => (
                      <div key={p.k} className="flex items-baseline gap-1.5">
                        <dt className="font-mono text-[12px] uppercase tracking-wider text-white/66">
                          {p.k}
                        </dt>
                        <dd className="font-mono text-xs text-white/85">{p.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-white/66">{lens.line}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-white/70" style={{ width: `${lens.confidence}%` }} />
                    </div>
                    <span className="font-mono text-[12px] text-white/66">conf. {lens.confidence}</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Veredicto */}
          <Reveal delay={0.25}>
            <div className="mt-3 rounded-2xl border border-emerald/40 bg-emerald/[0.05] p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-white/66">
                    Veredicto
                  </p>
                  <p className="mt-1 font-sans text-2xl font-bold tracking-wide text-emerald">
                    ↑ {v.direccion}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-white/66">
                    Confianza accionable
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-white">
                    {v.actionable_pct}%{' '}
                    <span className="text-base font-medium uppercase text-emerald">{v.nivel}</span>
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-white/66">
                    Coincidencia (κ)
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-white">
                    {v.kappa.toFixed(2)}
                  </p>
                </div>
                <p className="ml-auto max-w-xs text-sm leading-relaxed text-white/70">{v.porque}</p>
              </div>
              <p className="mt-4 font-mono text-[12px] leading-relaxed text-white/50">
                La <span className="text-white/70">confianza accionable</span> resume cuánto fiarte
                del resultado; la <span className="text-white/70">coincidencia (κ)</span>, cuánto
                coinciden los agentes entre sí (de 0 a 1).
              </p>
              <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[12px] uppercase tracking-wider text-white/66">
                    Acción sugerida
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/75">{v.accion}</p>
                </div>
                <div>
                  <p className="font-mono text-[12px] uppercase tracking-wider text-white/66">
                    Riesgo clave
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/75">{v.riesgo}</p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.3}>
            <p className="mt-3 font-mono text-[12px] leading-relaxed text-white/66">
              Ejemplo ilustrativo · no es una recomendación · cifras de muestra para enseñar el
              formato.
            </p>
          </Reveal>
        </section>

        {/* ── 5 · Agente de Estructura (módulo independiente) ───────── */}
        <section className="mx-auto max-w-3xl px-5 pt-24">
          <Reveal>
            <SectionHeading eyebrow="Además · para futuros" title="Agente de Estructura" />
            <p className="max-w-2xl text-lg leading-relaxed text-white/75">
              Un módulo aparte, pensado para quien opera futuros (oro, índices, divisas). Lee la
              estructura del precio en varias escalas de tiempo —desde la semanal hasta la de una
              hora— y espera a que el precio vuelva a un nivel clave. Cuando ese punto coincide con
              una zona importante, te propone por dónde entrar, hasta dónde arriesgar y qué objetivo
              buscar, siempre con un beneficio potencial mayor que el riesgo. Mecánico y
              transparente, sin caja negra.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
              Escribes tu símbolo de futuros —XAUUSD, NAS100, US500— y él lo traduce al contrato correcto.
            </p>
            <Link
              href="/estructura"
              className="mt-7 inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/[0.04] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:border-white/50 hover:bg-white/[0.08]"
            >
              Abrir Estructura
              <span aria-hidden="true">→</span>
            </Link>
          </Reveal>
        </section>

        {/* ── 6 · ¿Qué NO ofrece? ───────────────────────────────────── */}
        <section id="limites" className="mx-auto max-w-3xl px-5 pt-24 scroll-mt-20">
          <Reveal>
            <div className="rounded-2xl border border-white/20 bg-black/30 p-6 backdrop-blur-sm md:p-8">
              <SectionHeading eyebrow="¿Qué NO ofrece?" title="Los límites, por diseño" />
              <p className="mb-6 max-w-xl text-base leading-relaxed text-white/70">
                A.D.A.M. es una herramienta educativa y analítica. Decir esto claro te protege:
                define qué es y qué no es.
              </p>
              <ul className="flex flex-col gap-3">
                {NO_OFRECE.map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-white/75">
                    <span aria-hidden="true" className="mt-2 h-px w-4 flex-shrink-0 bg-white/40" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-7 border-t border-white/10 pt-5 font-mono text-xs leading-relaxed text-white/66">
                {DISCLAIMER}
              </p>
            </div>
          </Reveal>
        </section>

        {/* ── 7 · Cierre — mantra + entrada real ────────────────────── */}
        <section className="mx-auto max-w-3xl px-5 pt-24 text-center">
          <Reveal>
            <p className="mx-auto max-w-xl font-sans text-xl font-medium leading-relaxed text-white/75 md:text-2xl">
              Del ruido, los hechos. De los hechos, un consenso.{' '}
              <span className="text-white">Del consenso, tu decisión.</span>
            </p>
            <h2 className="mt-12 font-sans text-2xl font-bold tracking-wide text-white md:text-3xl">
              Pruébalo con cualquier activo
            </h2>
            <p className="mt-2 font-mono text-[12px] uppercase tracking-wider text-white/55">
              Datos de hoy · análisis real · en segundos
            </p>
            <Link
              href="/analysis"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-80"
            >
              Abrir análisis
              <span aria-hidden="true">→</span>
            </Link>
          </Reveal>
        </section>
      </main>
    </>
  );
}
