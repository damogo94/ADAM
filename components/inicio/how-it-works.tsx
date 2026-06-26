import { Reveal } from './decor/reveal';
import { SectionHeading } from './section-heading';

/**
 * HowItWorks — "Cómo funciona": el recorrido del ruido al veredicto como espina
 * numerada 01–05 (la narrativa de 5 capítulos como columna vertebral).
 */
const STEPS = [
  {
    wp: 'El ruido',
    title: 'Un símbolo, mil opiniones.',
    body: 'Escribes el ticker de una acción o una cripto y todo el mundo opina. ',
    turn: 'Pero opinar no es analizar.',
  },
  {
    wp: 'Los datos',
    title: 'Primero, los hechos.',
    body: 'El precio, las cuentas de la empresa y el contexto económico del momento. ',
    turn: 'Todavía sin interpretaciones encima.',
  },
  {
    wp: 'Los agentes',
    title: 'Tres especialistas, cada uno a lo suyo.',
    body: 'Uno mira solo el gráfico del precio —ni noticias ni opiniones— ',
    turn: 'a propósito, para no dejarse influir.',
  },
  {
    wp: 'La confluencia',
    title: 'No promediamos opiniones.',
    body: 'Las contrastamos entre sí. ',
    turn: 'Y cuando no coinciden, lo verás reflejado en la confianza del resultado.',
  },
  {
    wp: 'El veredicto',
    title: 'Una conclusión clara, con su confianza.',
    body: 'Te decimos qué vemos y cuánto fiarte de ello. ',
    turn: 'Sin prometer certezas que no existen.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="como"
      aria-labelledby="como-title"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 sm:px-10"
    >
      <Reveal className="mb-10">
        <SectionHeading
          id="como-title"
          eyebrow="Del ruido al veredicto"
          title="Cinco pasos, sin atajos."
          sub="El mismo recorrido que hace A.D.A.M. cada vez que escribes un ticker. En orden, y sin saltarse ninguno."
        />
      </Reveal>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.02]">
        {STEPS.map((s, i) => (
          <Reveal key={s.wp} delay={i * 0.04}>
            <article
              className={`grid grid-cols-[auto_1fr] gap-5 px-6 py-7 transition-colors hover:bg-ink/[0.02] sm:gap-8 sm:px-8 ${
                i === 0 ? '' : 'border-t border-ink/10'
              }`}
            >
              <div className="flex min-w-[54px] flex-col items-center gap-3">
                <span className="font-mono text-[0.9rem] font-semibold text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="hidden rotate-180 whitespace-nowrap font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink/40 [writing-mode:vertical-rl] sm:block">
                  {s.wp}
                </span>
              </div>
              <div>
                <p className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink/40 sm:hidden">
                  {s.wp}
                </p>
                <h3 className="font-sans text-fluid-h3 font-bold tracking-[-0.01em] text-ink">
                  {s.title}
                </h3>
                <p className="mt-2 max-w-2xl leading-[1.55] text-ink/72">
                  {s.body}
                  <span className="font-semibold text-ink">{s.turn}</span>
                </p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
