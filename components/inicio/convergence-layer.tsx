'use client';

import { useEffect, useState, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * ConvergenceLayer — hace LITERAL la confluencia. Tres hilos (accent — chrome,
 * NO market-color) van del pie de cada lente A1/A2/A3 al centro del gauge. Si los
 * agentes coinciden (κ ≥ 0,5) los hilos se UNEN en el gauge; si chocan (κ baja)
 * no llegan a unirse y se abren (el desacuerdo, visible).
 *
 * Mide posiciones reales del DOM (responsive-safe) y redibuja al conmutar o
 * recalcular (key). Solo ≥640px (lentes en fila); en móvil no aplica. Decoración
 * aria-hidden; con reduced-motion se pinta el estado final sin trazado.
 */
const EASE = [0.22, 0.61, 0.36, 1] as const;

interface Geo {
  w: number;
  h: number;
  lenses: { x: number; y: number }[];
  gauge: { x: number; y: number };
}

export function ConvergenceLayer({
  cardRef,
  active,
  kappa,
  replay,
}: {
  cardRef: RefObject<HTMLElement>;
  active: number;
  kappa: number;
  replay: number;
}) {
  const reduce = useReducedMotion();
  const [geo, setGeo] = useState<Geo | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      if (!window.matchMedia('(min-width: 640px)').matches) {
        setGeo(null);
        return;
      }
      const cr = card.getBoundingClientRect();
      const lensEls = Array.from(card.querySelectorAll('[data-conv="lens"]'));
      const gaugeEl = card.querySelector('[data-conv="gauge"]');
      if (lensEls.length < 3 || !gaugeEl) {
        setGeo(null);
        return;
      }
      const lenses = lensEls.slice(0, 3).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - cr.left, y: r.bottom - cr.top };
      });
      const gr = gaugeEl.getBoundingClientRect();
      setGeo({
        w: cr.width,
        h: cr.height,
        lenses,
        gauge: { x: gr.left + gr.width / 2 - cr.left, y: gr.top + gr.height / 2 - cr.top },
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, [cardRef, active]);

  if (!geo) return null;
  const meet = kappa >= 0.5;

  const paths = geo.lenses.map((l, i) => {
    let ex = geo.gauge.x;
    let ey = geo.gauge.y;
    if (!meet) {
      const t = 0.62; // se quedan cortos: no llegan a unirse
      ex = l.x + (geo.gauge.x - l.x) * t + (i - 1) * 12; // + ligera apertura
      ey = l.y + (geo.gauge.y - l.y) * t;
    }
    const midY = (l.y + ey) / 2;
    return `M${l.x.toFixed(1)},${l.y.toFixed(1)} C${l.x.toFixed(1)},${midY.toFixed(1)} ${ex.toFixed(1)},${midY.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  });

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20"
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      fill="none"
    >
      {paths.map((d, i) => (
        <motion.path
          key={`${active}-${replay}-${i}`}
          d={d}
          stroke="var(--accent)"
          strokeOpacity={meet ? 0.4 : 0.26}
          strokeWidth={1}
          pathLength={1}
          strokeDasharray={1}
          initial={reduce ? { strokeDashoffset: 0 } : { strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : 0.12 + i * 0.08 }}
        />
      ))}
      {meet ? (
        <motion.circle
          key={`dot-${active}-${replay}`}
          cx={geo.gauge.x}
          cy={geo.gauge.y}
          r={3}
          fill="var(--accent)"
          initial={reduce ? { opacity: 0.55 } : { opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ delay: reduce ? 0 : 0.78, duration: 0.3 }}
        />
      ) : null}
    </svg>
  );
}
