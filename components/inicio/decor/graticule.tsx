'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Graticule — retícula de calibre (firma "instrumento de precisión"). Chrome
 * puro: solo borde/ink, jamás market-color. Whisper-quiet, enmascarada en
 * radial para no competir con el contenido.
 *
 * `parallax`: contra-parallax ligado al puntero (se mueve EN CONTRA, da
 * profundidad de calibre). Gateado a ≥980px + pointer:fine, cap 8px, vía rAF y
 * un único listener pasivo; apagado con reduced-motion. Sin estado de React.
 */
export function Graticule({
  className,
  fine = false,
  parallax = false,
}: {
  className?: string;
  fine?: boolean;
  parallax?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parallax) return;
    const el = ref.current;
    if (!el) return;
    const finePointer = window.matchMedia('(min-width: 980px) and (pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reduce.matches) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    const onMove = (e: PointerEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const nx = -((e.clientX - cx) / cx) * 8;
      const ny = -((e.clientY - cy) / cy) * 8;
      if (Math.abs(nx - tx) < 0.1 && Math.abs(ny - ty) < 0.1) return;
      tx = nx;
      ty = ny;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [parallax]);

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        ref={ref}
        className={cn(fine ? 'graticule-bg-fine' : 'graticule-bg', 'absolute -inset-8 opacity-[0.35]')}
        style={{
          WebkitMaskImage: 'radial-gradient(120% 90% at 70% 30%, #000 0%, transparent 72%)',
          maskImage: 'radial-gradient(120% 90% at 70% 30%, #000 0%, transparent 72%)',
          willChange: parallax ? 'transform' : undefined,
        }}
      />
    </div>
  );
}
