import { cn } from '@/lib/utils';
import { Reveal } from './decor/reveal';
import { SectionHeading } from './section-heading';

/**
 * AgentRoster — "El sistema": A1/A2/A3(aislado)/A4/CMT. Diferenciados por
 * TIPOGRAFÍA (badge) y tratamiento (A3 aislado = borde discontinuo + etiqueta),
 * nunca por color. CMT ocupa fila completa (vigía autónomo, no analista por-ticker).
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

export function AgentRoster() {
  return (
    <section
      id="sistema"
      aria-labelledby="sistema-title"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 sm:px-10"
    >
      <Reveal className="mb-10">
        <SectionHeading
          id="sistema-title"
          eyebrow="El sistema"
          title="Quién mira y quién decide."
          sub="Cinco roles, distinguidos por lo que hacen —no por un color—. Cada uno tiene una sola responsabilidad."
        />
      </Reveal>

      <div className="grid gap-3 sm:grid-cols-2">
        {ROSTER.map((r, i) => {
          const isolated = 'isolated' in r && r.isolated;
          const span = 'span' in r && r.span;
          return (
            <Reveal key={r.tag} delay={i * 0.05} className={span ? 'sm:col-span-2' : undefined}>
              <div
                className={cn(
                  'flex h-full items-start gap-4 rounded-xl border p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 edge-hi',
                  isolated
                    ? 'iso-stripe-2 border-dashed border-ink/30'
                    : 'border-ink/10 bg-surface-2 hover:border-ink/20',
                )}
              >
                <span
                  className={cn(
                    'min-w-[46px] shrink-0 rounded-md border px-2 py-1 text-center font-mono text-[0.78rem] font-bold tracking-[0.05em] text-ink',
                    isolated ? 'border-dashed border-ink/30' : 'border-ink/15',
                  )}
                >
                  {r.tag}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-fluid-body font-semibold text-ink">{r.role}</h3>
                    {isolated ? (
                      <span className="rounded border border-dashed border-ink/30 px-1.5 py-px font-mono text-[0.58rem] font-bold uppercase tracking-[0.08em] text-ink/58">
                        aislado
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[0.9rem] leading-relaxed text-ink/58">{r.line}</p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
