'use client';

import type { CSSProperties } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionStyle } from 'framer-motion';

/**
 * AuroraBackground — capa de fondo fija (detrás de TODO) que evoluciona con el
 * progreso de scroll de la página (useScroll → useTransform).
 *
 * Reconciliada al re-skin "instrumento de precisión": atmósfera NEUTRA con un
 * único acento frío de marca (#5B8AF0), sin color decorativo (antes índigo →
 * violeta → teal + glow emerald). Los colores viven como CSS variables LOCALES
 * de /inicio (no se tocan los tokens globales del theme).
 *
 * Ligera a propósito: 4 radial-gradients muy difuminados sobre el `void`. Sin
 * WebGL (el R3F vive solo en el hero). prefers-reduced-motion → aurora estática.
 */

// Paleta local — CSS variables de /inicio, no tokens globales del theme.
// `as CSSProperties`: las custom props (--*) no están en el tipo (el index
// signature se quitó en @types/react), pero el objeto es asignable a CSSProperties.
const AURORA_VARS = {
  '--aurora-1': '#5b8af0', // acento de marca (azul-acero)
  '--aurora-2': '#3b4252', // neutro frío
  '--aurora-3': '#5b8af0', // acento (atenuado por opacidad)
  '--aurora-verdict': '#5b8af0', // brillo del acento (no market-emerald)
} as CSSProperties;

function Blob({ className, style }: { className: string; style?: MotionStyle }) {
  return <motion.div aria-hidden className={`absolute rounded-full blur-[110px] ${className}`} style={style} />;
}

export function AuroraBackground() {
  const reduce = useReducedMotion();
  // useScroll sin target → progreso de la ventana (0 arriba, 1 abajo).
  const { scrollYProgress } = useScroll();

  // Deriva movimientos/intensidades del scroll (hooks SIEMPRE se ejecutan).
  const y1 = useTransform(scrollYProgress, [0, 1], ['-12%', '28%']);
  const y2 = useTransform(scrollYProgress, [0, 1], ['18%', '-22%']);
  const x3 = useTransform(scrollYProgress, [0, 1], ['-8%', '20%']);
  const drift1 = useTransform(scrollYProgress, [0, 1], [0.2, 0.1]);
  const drift2 = useTransform(scrollYProgress, [0, 1], [0.12, 0.18]);
  // El glow del veredicto aparece hacia el centro de la página (sección ejemplo).
  const verdictGlow = useTransform(scrollYProgress, [0.32, 0.5, 0.7], [0, 0.24, 0.08]);

  if (reduce) {
    // Aurora estática equivalente — sin animación.
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void"
        style={AURORA_VARS}
      >
        <div className="absolute -left-[10%] top-[6%] h-[55vh] w-[55vh] rounded-full bg-[var(--aurora-1)] opacity-[0.14] blur-[110px]" />
        <div className="absolute right-[2%] top-[40%] h-[50vh] w-[50vh] rounded-full bg-[var(--aurora-2)] opacity-[0.12] blur-[110px]" />
        <div className="absolute left-[20%] bottom-[6%] h-[45vh] w-[45vh] rounded-full bg-[var(--aurora-3)] opacity-[0.12] blur-[110px]" />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void"
      style={AURORA_VARS}
    >
      <Blob
        className="-left-[10%] top-[4%] h-[58vh] w-[58vh] bg-[var(--aurora-1)]"
        style={{ y: y1, opacity: drift1 }}
      />
      <Blob
        className="right-0 top-[36%] h-[52vh] w-[52vh] bg-[var(--aurora-2)]"
        style={{ y: y2, opacity: drift2 }}
      />
      <Blob
        className="left-[18%] bottom-[4%] h-[48vh] w-[48vh] bg-[var(--aurora-3)]"
        style={{ x: x3, opacity: 0.12 }}
      />
      {/* Glow del veredicto — acento frío de marca (no market-color). */}
      <Blob
        className="left-1/2 top-1/2 h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 bg-[var(--aurora-verdict)]"
        style={{ opacity: verdictGlow }}
      />
      {/* Vignette para mantener legible el texto sobre la aurora. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
