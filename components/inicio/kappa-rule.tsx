'use client';

import { useEffect } from 'react';
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatKappa } from './lib/format';

/**
 * KappaRule — regla de calibre para κ (coincidencia entre agentes, 0–1).
 *
 * FIREWALL: el track, los tick-rules, los umbrales 0,34/0,67 y las etiquetas
 * baja/media/alta son CHROME NEUTRO (ink) — NO se tiñen a priori. El único color
 * de mercado lo reciben (a) el marcador deslizante y (b) el relleno tenue de la
 * zona donde cae κ EN este escenario, ambos derivados de VERDICT_TONE
 * (props `markerClass` / `zoneClass`). El color lo aporta el dato vivo, no la
 * escala. reduced-motion → el marcador salta a su sitio.
 */
const EASE = [0.22, 0.61, 0.36, 1] as const;

export function KappaRule({
  kappa,
  markerClass,
  zoneClass,
}: {
  kappa: number;
  markerClass: string;
  zoneClass: string;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(kappa * 100);
  const left = useMotionTemplate`${x}%`;

  useEffect(() => {
    if (reduce) {
      x.set(kappa * 100);
      return;
    }
    const controls = animate(x, kappa * 100, { duration: 0.7, ease: EASE });
    return () => controls.stop();
  }, [kappa, reduce, x]);

  // Zona donde cae κ (umbrales 0,34 / 0,67 — espejo de los de confluencia).
  const zone = kappa >= 0.67 ? 'alta' : kappa >= 0.34 ? 'media' : 'baja';
  const zoneLeft = zone === 'alta' ? '67%' : zone === 'media' ? '34%' : '0%';
  const zoneWidth = zone === 'alta' ? '33%' : zone === 'media' ? '33%' : '34%';

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink/45">
          κ coincidencia
        </span>
        <span className="font-mono text-[0.72rem] text-ink/72">{formatKappa(kappa)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-ink/10">
        {/* zona activa — único relleno con tono de mercado */}
        <div
          className={cn('absolute inset-y-0 rounded-full opacity-60', zoneClass)}
          style={{ left: zoneLeft, width: zoneWidth }}
        />
        {/* separadores de zona (chrome) */}
        <span className="absolute -inset-y-0.5 w-px bg-ink/25" style={{ left: '34%' }} />
        <span className="absolute -inset-y-0.5 w-px bg-ink/25" style={{ left: '67%' }} />
        {/* marcador deslizante — dato de mercado */}
        <motion.span
          className={cn('absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full', markerClass)}
          style={{ left }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.55rem] uppercase tracking-[0.08em] text-ink/40">
        <span>0</span>
        <span>baja</span>
        <span>media</span>
        <span>alta</span>
        <span>1</span>
      </div>
    </div>
  );
}
