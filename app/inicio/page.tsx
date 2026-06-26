import type { Metadata } from 'next';
import { SiteHeader } from '@/components/inicio/site-header';
import { Hero } from '@/components/inicio/hero';
import { HowItWorks } from '@/components/inicio/how-it-works';
import { AgentRoster } from '@/components/inicio/agent-roster';
import { ReasonFlow } from '@/components/inicio/reason-flow';
import { HowToRead } from '@/components/inicio/how-to-read';
import { StructureChart } from '@/components/inicio/structure-chart';
import { Limits } from '@/components/inicio/limits';
import { ClosingCta } from '@/components/inicio/closing-cta';
import { SiteFooter } from '@/components/inicio/site-footer';
import { Grain } from '@/components/inicio/decor/grain';
import { SectionDivider } from '@/components/inicio/decor/tick-rule';

/**
 * /inicio — landing pública de A.D.A.M. ("instrumento de precisión", oscuro).
 *
 * Server component: solo compone. La pieza central es el HERO manipulable
 * (Instrument): un EJEMPLO ILUSTRATIVO de 3 escenarios que enseña el modelo de
 * confianza tocándolo. El resto es profundidad progresiva. Sin R3F, sin pin de
 * scroll; motion vía Framer Motion respetando prefers-reduced-motion.
 *
 * Ruta pública: NO está en APP_ROUTES de middleware.ts → sin auth gate.
 */
export const metadata: Metadata = {
  title: 'Inicio · A.D.A.M.',
  description:
    'Qué es A.D.A.M.: copiloto de análisis financiero multiagente que examina un activo desde varios ángulos. Educativo · no constituye asesoramiento financiero regulado.',
};

export default function InicioPage() {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-ink"
      >
        Saltar al contenido
      </a>
      <span id="top" aria-hidden className="absolute top-0" />
      <Grain />
      <SiteHeader />

      <main id="contenido" className="relative pb-24">
        <Hero />

        <div className="space-y-24 pt-6 md:space-y-32 md:pt-10">
          <HowItWorks />
          <AgentRoster />
          <SectionDivider />
          <ReasonFlow />
          <HowToRead />
          <SectionDivider />
          <StructureChart />
          <Limits />
          <ClosingCta />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
