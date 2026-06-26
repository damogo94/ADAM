import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Reveal } from './decor/reveal';
import { arw, btnBase, btnPrimary } from './lib/ui';

/**
 * ClosingCta — mantra de cierre (cadencia de tres tiempos) + único punto de
 * conversión final hacia /analysis.
 */
export function ClosingCta() {
  return (
    <section aria-labelledby="cierre-title" className="mx-auto w-full max-w-6xl px-5 text-center sm:px-10">
      <Reveal>
        <p className="mx-auto max-w-xl font-sans text-[clamp(1.25rem,1rem+1.4vw,1.9rem)] font-medium leading-[1.4] text-ink/72">
          Del ruido, los hechos. De los hechos, un consenso.{' '}
          <b className="font-semibold text-ink">Del consenso, tu decisión.</b>
        </p>
      </Reveal>
      <Reveal delay={0.05}>
        <h2 id="cierre-title" className="mt-16 font-sans text-fluid-h2 font-bold tracking-[-0.015em] text-ink">
          Pruébalo con cualquier activo.
        </h2>
        <p className="mt-3 font-mono text-fluid-caption uppercase tracking-[0.1em] text-ink/45">
          Datos de hoy · análisis real · en segundos
        </p>
        <div className="mt-8">
          <Link href="/analysis" className={cn(btnBase, btnPrimary, 'min-h-[48px] px-6')}>
            Abrir análisis
            <span aria-hidden="true" className={arw}>
              →
            </span>
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
