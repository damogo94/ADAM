'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArchitectureDiagram } from '@/components/architecture-diagram';
import { HeroFallback } from './hero-fallback';

/**
 * InicioContent — explainer scroll-driven de A.D.A.M. (island cliente de /inicio).
 *
 * Copy DERIVADO del repo (no inventado):
 *   - Posicionamiento y disclaimer: README.md, CONTEXT.md, DISCLAIMER_LITERAL.
 *   - Capacidades / pipeline: prompts de A1, A2, A3 (aislado), A4, CMT scanner.
 *   - Voz: agents/shared/atlas-capital-style.ts (directo, corto, sin relleno).
 *
 * Rendimiento:
 *   - Hero 3D vía dynamic(ssr:false) → three/R3F solo se descargan aquí.
 *   - prefers-reduced-motion: ni canvas (se sirve HeroFallback estático) ni
 *     reveals; el contenido queda visible sin animación.
 */

// El bundle de three/R3F vive SOLO en este chunk: import dinámico, sin SSR.
const Hero3D = dynamic(() => import('./hero-3d').then((m) => m.Hero3D), {
  ssr: false,
  loading: () => <HeroFallback />,
});

const CAPABILITIES = [
  {
    tag: 'A1',
    title: 'Lee el activo',
    body: 'Precio, fundamentales y noticias recientes para detectar una anomalía, una vulnerabilidad o una oportunidad.',
  },
  {
    tag: 'A2',
    title: 'Sitúa la macro',
    body: 'Ciclo económico, tipos, inflación y correlaciones. Dónde encaja el activo en el régimen actual.',
  },
  {
    tag: 'A3',
    title: 'Estudia el gráfico',
    body: 'Tendencia, soportes, resistencias y patrones — más un plan de trade con entrada, stop y objetivo. Solo con el precio.',
  },
  {
    tag: 'A4',
    title: 'Cuantifica la confluencia',
    body: 'Cruza las tres lecturas en un único veredicto, con su nivel de confianza.',
  },
  {
    tag: 'CMT',
    title: 'Vigila tu watchlist',
    body: 'Escanea tus activos en busca de señales y las clasifica por urgencia.',
  },
] as const;

const PIPELINE = [
  { n: '01', label: 'A1 · Activo', text: 'Analiza el activo desde su micro: precio, ratios y noticias.', isolated: false },
  { n: '02', label: 'A2 · Macro', text: 'Lo contextualiza en el ciclo económico, los tipos y la inflación.', isolated: false },
  {
    n: '03',
    label: 'A3 · Técnico',
    text: 'Estudia solo el gráfico (OHLCV). Aislado: nunca ve noticias, macro ni a los demás agentes.',
    isolated: true,
  },
  {
    n: '04',
    label: 'A4 · Confluencia',
    text: 'Ensambla A1, A2 y A3 en una recomendación, citando a A3 sin reescribirlo.',
    isolated: false,
  },
  {
    n: '05',
    label: 'CMT · Scanner',
    text: 'En paralelo y de forma autónoma, revisa tu watchlist con el mismo motor técnico — sin LLM.',
    isolated: false,
  },
] as const;

const OFRECE = [
  {
    title: 'Varias perspectivas en segundos',
    body: 'Micro, macro y técnico en una sola pasada sobre el mismo ticker.',
  },
  {
    title: 'Sin sesgo de narrativa',
    body: 'A3 trabaja aislado: solo ve el precio. Nunca noticias ni opiniones de los otros agentes.',
  },
  {
    title: 'Confluencia cuantificada',
    body: 'Un score y un nivel —baja, media o alta— en lugar de una opinión vaga.',
  },
  {
    title: 'Señales sobre lo tuyo',
    body: 'El scanner determinista prioriza tu watchlist por urgencia, sin coste de tokens.',
  },
] as const;

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
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">{eyebrow}</p>
      <h2 className="mt-2 font-orbitron text-2xl font-bold tracking-wide text-white md:text-3xl">
        {title}
      </h2>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 min-w-[2.75rem] flex-shrink-0 items-center justify-center rounded border border-white/15 bg-white/[0.04] px-1.5 font-mono text-[10px] font-bold tracking-wider text-white/80">
      {children}
    </span>
  );
}

export function InicioContent() {
  const reduce = useReducedMotion();

  return (
    <main className="relative min-h-screen overflow-x-hidden pb-28">
      {/* ── 1 · ¿Qué es ADAM? (hero 3D) ─────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pt-14 md:pt-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/55">
              Anomaly Detection &amp; Analysis Module
            </p>
            <h1 className="mt-3 font-orbitron text-5xl font-black tracking-[0.14em] text-white md:text-6xl">
              A.D.A.M.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/80">
              Un copiloto de análisis financiero multiagente. Le das un ticker y lo examina desde
              varios ángulos para detectar lo que el ruido esconde.
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/50">
              No es un broker. No ejecuta órdenes ni mueve tu capital.
            </p>
            <Link
              href="/analysis"
              className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition-opacity hover:opacity-80"
            >
              Abrir análisis
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Caja contenida del 3D — da tamaño al Canvas (no full-screen). */}
          <div className="relative mx-auto h-[280px] w-full max-w-[420px] md:h-[420px]">
            {reduce ? <HeroFallback /> : <Hero3D />}
          </div>
        </div>
      </section>

      {/* ── 2 · ¿Qué hace? ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 pt-24">
        <Reveal>
          <SectionHeading eyebrow="¿Qué hace?" title="Analiza un activo desde varios frentes" />
          <p className="mb-8 max-w-xl text-base leading-relaxed text-white/70">
            Cinco especialistas miran el mismo activo, cada uno lo suyo. Luego se confrontan y se
            consolidan en una sola lectura — más un radar que vigila tu watchlist.
          </p>
        </Reveal>
        <ul className="flex flex-col gap-3">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.tag} delay={i * 0.05}>
              <li className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <Badge>{c.tag}</Badge>
                <div>
                  <h3 className="font-medium text-white">{c.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{c.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ── 3 · ¿Cómo funciona? ─────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 pt-24">
        <Reveal>
          <SectionHeading eyebrow="¿Cómo funciona?" title="El pipeline, paso a paso" />
        </Reveal>
        <ol className="flex flex-col gap-3">
          {PIPELINE.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.05}>
              <li
                className={
                  'flex gap-4 rounded-xl border p-4 ' +
                  (s.isolated
                    ? 'border-dashed border-white/40 bg-white/[0.04]'
                    : 'border-white/10 bg-white/[0.02]')
                }
              >
                <span className="font-mono text-sm font-bold text-white/40">{s.n}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-medium text-white">{s.label}</h3>
                    {s.isolated && (
                      <span className="rounded bg-white/15 px-1 py-px font-mono text-[7px] font-bold uppercase tracking-wider text-white/80">
                        aislado
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{s.text}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
        <Reveal delay={0.1}>
          <p className="mt-4 text-xs leading-relaxed text-white/40">
            Si A1 o A2 detectan algo, un debate A1×A2 afina la lectura antes de que A4 consolide. A3
            nunca participa en ese debate — su aislamiento es la regla más importante del sistema.
          </p>
        </Reveal>
        <Reveal delay={0.15} className="mt-8">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            El pipeline real
          </p>
          <ArchitectureDiagram />
        </Reveal>
      </section>

      {/* ── 4 · ¿Qué ofrece? ────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 pt-24">
        <Reveal>
          <SectionHeading eyebrow="¿Qué ofrece?" title="Para qué te sirve" />
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {OFRECE.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.05}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="font-medium text-white">{b.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{b.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 5 · ¿Qué NO ofrece? ─────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 pt-24">
        <Reveal>
          <div className="rounded-2xl border border-white/20 bg-white/[0.03] p-6 md:p-8">
            <SectionHeading eyebrow="¿Qué NO ofrece?" title="Los límites, por diseño" />
            <p className="mb-6 max-w-xl text-base leading-relaxed text-white/70">
              A.D.A.M. es una herramienta educativa y analítica. Decir esto claro te protege: define
              qué es y qué no es.
            </p>
            <ul className="flex flex-col gap-3">
              {NO_OFRECE.map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed text-white/75">
                  <span aria-hidden="true" className="mt-2 h-px w-4 flex-shrink-0 bg-white/40" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-7 border-t border-white/10 pt-5 font-mono text-xs leading-relaxed text-white/55">
              {DISCLAIMER}
            </p>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
