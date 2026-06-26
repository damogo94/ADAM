'use client';

import { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

/**
 * SignalTrace — guiño a la tesis "del ruido, la señal": un sparkline que arranca
 * DENTADO (ruido) y se alisa a una línea limpia al cargar. SVG barato (sin WebGL),
 * one-shot. Chrome (accent), aria-hidden. reduced-motion → pinta la señal final.
 */
const N = 32;
const W = 1000;
const H = 100;

// Determinista (Math.sin, sin random): ruido de alta frecuencia → señal suave.
const noise = Array.from({ length: N }, (_, i) =>
  0.5 + 0.4 * Math.sin(i * 2.3) * Math.cos(i * 1.1 + 0.5) * Math.sin(i * 0.7 + 1),
);
const signal = Array.from({ length: N }, (_, i) => 0.74 - 0.52 * (i / (N - 1)) + 0.04 * Math.sin(i * 0.55));

function buildPath(t: number): string {
  let d = '';
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * W;
    const yv = noise[i]! + (signal[i]! - noise[i]!) * t;
    const y = Math.max(0.04, Math.min(0.96, yv)) * H;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return d.trim();
}

export function SignalTrace({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const t = useMotionValue(reduce ? 1 : 0);
  const d = useTransform(t, buildPath);

  useEffect(() => {
    if (reduce) {
      t.set(1);
      return;
    }
    const controls = animate(t, 1, { duration: 1.6, ease: [0.22, 0.61, 0.36, 1], delay: 0.25 });
    return () => controls.stop();
  }, [reduce, t]);

  return (
    <svg aria-hidden className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" fill="none">
      <motion.path
        d={d}
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeOpacity={0.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
