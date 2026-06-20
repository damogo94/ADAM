import type { Metadata } from 'next';
import { InicioContent } from '@/components/inicio/inicio-content';

/**
 * /inicio — explainer público de A.D.A.M. (onboarding / landing).
 *
 * Server component: solo declara metadata propio y monta el island cliente
 * (InicioContent), que contiene los reveals on-scroll y el hero 3D cargado
 * con dynamic(ssr:false). Así el bundle de three/R3F vive SOLO en esta ruta.
 *
 * Ruta pública: NO está en APP_ROUTES de middleware.ts → sin auth gate.
 * Estática por defecto (sin force-dynamic) para no penalizar el LCP.
 *
 * El copy se deriva del repo (README, CONTEXT, prompts de agentes y
 * agents/shared/atlas-capital-style.ts) — ver InicioContent.
 */
export const metadata: Metadata = {
  title: 'Inicio · A.D.A.M.',
  description:
    'Qué es A.D.A.M.: copiloto de análisis financiero multiagente que examina un activo desde varios ángulos. Educativo · no constituye asesoramiento financiero regulado.',
};

export default function InicioPage() {
  return <InicioContent />;
}
