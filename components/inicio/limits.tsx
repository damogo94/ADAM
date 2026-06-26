import { Reveal } from './decor/reveal';
import { Eyebrow } from './section-heading';

/**
 * Limits — "Qué NO ofrece": los límites por diseño + disclaimer. Honestidad:
 * decir qué NO es protege al usuario. Separador U+00B7 (DISCLAIMER_LITERAL).
 */
const NO_OFRECE = [
  'No es asesoramiento financiero personalizado.',
  'No ejecuta operaciones ni mueve tu capital. A.D.A.M. nunca es tu broker.',
  'No garantiza resultados ni predice el futuro.',
  'No sustituye a un asesor profesional certificado.',
];

// Separador U+00B7 — coincide con DISCLAIMER_LITERAL (agents/shared/types.ts).
const DISCLAIMER = 'Análisis educativo · no constituye asesoramiento financiero regulado';

export function Limits() {
  return (
    <section
      id="limites"
      aria-labelledby="limites-title"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 sm:px-10"
    >
      <Reveal>
        <div className="rounded-2xl border border-ink/15 bg-black/30 p-6 backdrop-blur-sm sm:p-10 md:p-12 edge-hi">
          <Eyebrow>Qué NO ofrece</Eyebrow>
          <h2
            id="limites-title"
            className="mt-4 max-w-2xl font-sans text-fluid-h2 font-bold tracking-[-0.015em] text-ink"
          >
            Precisión también es saber dónde paramos.
          </h2>
          <ul className="mt-8 grid gap-3">
            {NO_OFRECE.map((line) => (
              <li key={line} className="flex items-start gap-4 text-[0.95rem] leading-relaxed text-ink/72">
                <span aria-hidden="true" className="mt-px shrink-0 font-mono text-ink/40">
                  ✕
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 border-t border-ink/10 pt-5 font-mono text-[0.74rem] tracking-[0.03em] text-ink/58">
            {DISCLAIMER}
          </p>
        </div>
      </Reveal>
    </section>
  );
}
