'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ScanCarousel — sustituye la antigua animación de "sweep" (línea blanca
 * recorriendo el cuadro) por un carrusel secuencial de tareas. Una tarea
 * a la vez, entrada con fade+slide, salida implícita al cambiar de índice.
 *
 * INTEGRACIÓN CON DATOS REALES (TODO futuro):
 *   Hoy la rotación es por temporizador (no hay progreso real de tarea-a-
 *   tarea desde el backend — el pipeline no emite eventos intermedios).
 *   Cuando el pipeline emita progreso (p. ej. SSE/streaming en /api/agents/run
 *   con eventos como `task:start` / `task:done`), reemplazar el efecto del
 *   temporizador por un useEffect que sincronice `index` con el índice de
 *   la tarea ACTIVA recibida. La prop `tasks` ya admite ese caso porque
 *   trabaja sobre el array completo.
 *
 * INVARIANTES:
 *   - NO altera lógica de negocio. Solo presentación.
 *   - Reserva altura fija (min-h) → cero layout shift al rotar.
 *   - Respeta `prefers-reduced-motion`: cambio directo sin animación.
 *   - Estado vacío idle (tasks=[]): dot + "en espera", no pantalla blanca.
 *   - Textos largos: clamp a 2 líneas, ellipsis natural.
 */

const ROTATION_MS = 2800; // 2.5–3.5s rango pedido; 2.8 = punto medio

interface ScanCarouselProps {
  /** Tareas a rotar. Si está vacío, renderiza estado idle discreto. */
  tasks: string[];
  /** Icono opcional al lado de cada tarea (símbolo unicode o ReactNode). */
  icon?: ReactNode;
  /**
   * Índice externo (opcional). Si se pasa, el carrusel deja de rotar por
   * timer y refleja el índice indicado — pensado para cuando los datos
   * reales lleguen y queramos sincronizar progreso real.
   */
  activeIndex?: number;
}

export function ScanCarousel({ tasks, icon, activeIndex }: ScanCarouselProps) {
  const [internalIndex, setInternalIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const isExternal = typeof activeIndex === 'number';
  const index = isExternal ? activeIndex! : internalIndex;

  // Detecta prefers-reduced-motion sin layout effects (cliente puro).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    // Algunos browsers viejos solo soportan addListener
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  // Rotación temporizada solo cuando NO hay índice externo controlado.
  useEffect(() => {
    if (isExternal || tasks.length <= 1) return;
    const id = window.setInterval(() => {
      setInternalIndex((i) => (i + 1) % tasks.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [isExternal, tasks.length]);

  // Si la lista cambia (otro agente, otro run), reset del cursor interno.
  useEffect(() => {
    if (!isExternal) setInternalIndex(0);
  }, [tasks.join('|'), isExternal]);

  // Estado vacío idle — discreto, sin "pantalla en blanco".
  if (!tasks.length) {
    return (
      <div className="flex min-h-[60px] items-center gap-1.5 py-2 font-mono text-[9px] tracking-wider text-white/40">
        <span className="h-1 w-1 rounded-full bg-white/40 animate-blink-slow" />
        <span>en espera</span>
      </div>
    );
  }

  const current = tasks[index] ?? tasks[0]!;

  return (
    // Altura mínima fija = sin layout shift al rotar. min-h y no h-fixed
    // para que un texto a 2 líneas no recorte si llega cerca del límite.
    <div className="relative min-h-[60px] py-2">
      <div
        // key fuerza remount del nodo activo → re-dispara animación de entrada
        key={index}
        className={cn(
          'flex items-start gap-1.5 font-mono text-[10px] leading-snug text-white/80',
          !reducedMotion && 'animate-fade-slide-in'
        )}
      >
        {icon && <span className="flex-shrink-0 pt-px text-white/55">{icon}</span>}
        <span className="line-clamp-2 break-words">{current}</span>
      </div>

      {/* Indicador discreto de posición. Si solo hay 1 tarea, no se muestra. */}
      {tasks.length > 1 && (
        <div className="absolute bottom-0 left-0 flex gap-1 pt-1">
          {tasks.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-px w-2 rounded-full transition-opacity duration-300',
                i === index ? 'bg-white/70' : 'bg-white/15'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
