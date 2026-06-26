'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Reveal on-scroll con Framer Motion. Con prefers-reduced-motion se renderiza
 * estático (visible, sin transición) — el contrato de la landing.
 *
 * Curva maestra cubic-bezier(.22,.61,.36,1): la misma de todo el sistema.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px -8% 0px' }}
      transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
