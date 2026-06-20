'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScanCarousel — carrusel vertical estilo "log de tareas".
 *
 * Diseño (revisión 2026-05):
 *   - Ventana de 3 líneas visibles a la vez (no 1 como antes).
 *   - Tareas entran por abajo, se mueven arriba a medida que la siguiente
 *     toma el foco, y se desvanecen al salir por la parte superior.
 *   - Rotación más rápida (1.1s, antes 2.8s) → percepción de mucho más
 *     trabajo en curso, sin tocar nada del pipeline.
 *   - Máscaras de fade top/bottom para sensación de scroll continuo.
 *
 * Buffer largo (BUFFER_REPEATS=30) garantiza scroll fluido sin "saltos"
 * por reset modular: en cualquier escaneo realista (worst case ~60s en
 * Hobby lambda) jamás se alcanza el final del buffer.
 *
 * INVARIANTES preservados:
 *   - NO altera lógica de negocio, solo presentación.
 *   - Altura fija → cero layout shift.
 *   - `prefers-reduced-motion`: estática (sin transform ni transition).
 *   - tasks=[] → estado idle discreto, sin pantalla en blanco.
 *   - Prop `activeIndex` reservada para sincronización futura con
 *     progreso real del pipeline (cuando emita eventos por SSE).
 */

const ROTATION_MS = 1100; // antes 2800 — sensación de actividad real
const LINE_HEIGHT = 20; // px · debe coincidir con leading inline abajo
const VISIBLE_COUNT = 3; // líneas simultáneas en el viewport
const BUFFER_REPEATS = 30; // ~2 min de rotación continua sin loop visible

interface ScanCarouselProps {
  /** Tareas a rotar. Vacío → renderiza estado idle discreto. */
  tasks: string[];
  /** Icono opcional al lado de la tarea EN FOCO. */
  icon?: ReactNode;
  /**
   * Índice externo (opcional). Si se pasa, el carrusel deja de avanzar
   * por timer y refleja el índice indicado — para sincronizar con
   * progreso real del pipeline cuando se implemente SSE/streaming.
   */
  activeIndex?: number;
}

export function ScanCarousel({ tasks, icon, activeIndex }: ScanCarouselProps) {
  const [tick, setTick] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const isExternal = typeof activeIndex === 'number';

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, []);

  // Rotación temporizada (solo si no hay índice externo)
  useEffect(() => {
    if (isExternal || tasks.length === 0) return;
    const id = window.setInterval(() => setTick((t) => t + 1), ROTATION_MS);
    return () => window.clearInterval(id);
  }, [isExternal, tasks.length]);

  // Reset cuando cambia la lista (otro agente, otro run)
  useEffect(() => {
    if (!isExternal) setTick(0);
  }, [tasks.join('|'), isExternal]);

  // Estado vacío idle — sin pantalla en blanco
  if (tasks.length === 0) {
    return (
      <div className="flex h-[60px] items-center gap-1.5 py-2 font-mono text-[12px] tracking-wider text-white/66">
        <span className="h-1 w-1 rounded-full bg-white/40 animate-blink-slow" />
        <span>en espera</span>
      </div>
    );
  }

  const currentIdx = isExternal ? activeIndex! : tick;
  // Buffer = lista repetida muchas veces. Para scans realistas nunca
  // alcanzamos el final → la sensación es de scroll infinito sin saltos.
  const buffer = Array.from({ length: BUFFER_REPEATS }, () => tasks).flat();
  const safeIdx = Math.min(currentIdx, buffer.length - VISIBLE_COUNT);
  const translateY = reducedMotion ? 0 : -safeIdx * LINE_HEIGHT;

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: `${VISIBLE_COUNT * LINE_HEIGHT}px` }}
      aria-live="polite"
      aria-label={tasks[currentIdx % tasks.length]}
    >
      <div
        className={cn(
          'flex flex-col will-change-transform',
          !reducedMotion && 'transition-transform duration-500 ease-out'
        )}
        style={{ transform: `translateY(${translateY}px)` }}
      >
        {buffer.map((task, i) => {
          // offset relativo al foco (slot 0 = en cabeza, slot 1 = siguiente, …)
          const offset = i - safeIdx;
          // Solo los 3 slots visibles tienen opacidad. El resto vive
          // fuera del viewport (overflow-hidden los recorta).
          let opacity = 0;
          if (offset === 0) opacity = 1;
          else if (offset === 1) opacity = 0.55;
          else if (offset === 2) opacity = 0.25;

          return (
            <div
              key={i}
              style={{
                height: `${LINE_HEIGHT}px`,
                lineHeight: `${LINE_HEIGHT}px`,
                opacity,
              }}
              className="flex items-center gap-1.5 font-mono text-[12px] text-white/85 transition-opacity duration-500"
            >
              {icon && offset === 0 && (
                <span className="flex-shrink-0 text-white/66">{icon}</span>
              )}
              <span className="truncate">{task}</span>
            </div>
          );
        })}
      </div>

      {/* Fade masks top/bottom — acentúan la sensación de scroll
          continuo (las tareas salen de la vista difuminadas). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-3 bg-gradient-to-b from-surface-2 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3 bg-gradient-to-t from-surface-2 to-transparent" />
    </div>
  );
}
