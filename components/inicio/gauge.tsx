'use client';

import { useEffect, useRef } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { formatInt } from './lib/format';

/**
 * Gauge — dial radial de "confianza accionable". El arco y la cifra son DATO DE
 * MERCADO (color vía `hex`, derivado de VERDICT_TONE). Los tick-marks de los
 * umbrales 34/67 (baja|media|alta) son chrome (accent/ink) y se "encienden"
 * cuando el accionable del escenario activo supera ese umbral → dial graduado.
 *
 * Movimiento: la CIFRA hace count-up con tween (sin overshoot — la marca la
 * vende determinista); el ARCO se asienta como aguja analógica (spring suave,
 * "needle settle"). reduced-motion → ambos saltan a su valor final.
 */
const C = 276.5; // circunferencia del aro (r = 44)
const EASE = [0.22, 0.61, 0.36, 1] as const;

function tickPoint(frac: number, r: number) {
  const a = (-90 + 360 * frac) * (Math.PI / 180);
  return { x: 52 + r * Math.cos(a), y: 52 + r * Math.sin(a) };
}

export function Gauge({ value, hex, replay = 0 }: { value: number; hex: string; replay?: number }) {
  const reduce = useReducedMotion();
  const num = useMotionValue(value);
  const arc = useMotionValue(value);
  const numRef = useRef<HTMLSpanElement>(null);
  const prevReplay = useRef(replay);
  const dashoffset = useTransform(arc, (v) => C * (1 - v / 100));

  useMotionValueEvent(num, 'change', (v) => {
    if (numRef.current) numRef.current.textContent = formatInt(v);
  });

  useEffect(() => {
    const replayed = prevReplay.current !== replay;
    prevReplay.current = replay;
    if (reduce) {
      num.set(value);
      arc.set(value);
      return;
    }
    // [recalcular] (mismos datos): reinicia a 0 y vuelve a contar al MISMO valor.
    if (replayed) {
      num.set(0);
      arc.set(0);
    }
    const c1 = animate(num, value, { duration: 0.8, ease: EASE });
    const c2 = animate(arc, value, { type: 'spring', stiffness: 90, damping: 18 });
    return () => {
      c1.stop();
      c2.stop();
    };
  }, [value, replay, reduce, num, arc]);

  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true">
        <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(245,245,247,.10)" strokeWidth="6" />
        <motion.circle
          cx="52"
          cy="52"
          r="44"
          fill="none"
          stroke={hex}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          style={{ strokeDashoffset: dashoffset }}
          transform="rotate(-90 52 52)"
        />
        {[34, 67].map((t) => {
          const p1 = tickPoint(t / 100, 40);
          const p2 = tickPoint(t / 100, 48);
          const lit = value >= t;
          return (
            <line
              key={t}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={lit ? 'var(--accent)' : 'rgba(245,245,247,.20)'}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span ref={numRef} className="font-mono text-2xl font-semibold leading-none text-ink">
          {formatInt(value)}
        </span>
        <span className="mt-[3px] font-mono text-[0.56rem] uppercase tracking-[0.12em] text-ink/58">
          accionable
        </span>
      </div>
    </div>
  );
}
