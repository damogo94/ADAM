'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Razonamiento — desplegable de NIVEL 3 (divulgación progresiva de agent cards).
 *
 * Segundo toggle anidado dentro del cuerpo de un card: deja la señal decision-grade
 * (datos + titular) visible en el nivel 2 y pliega la prosa narrativa / secciones
 * secundarias por defecto.
 *
 * DESCUBRIBILIDAD ≠ PROMINENCIA. El affordance se distingue como TOGGLE (chevron +
 * separador estructural), no se hace más ruidoso: reposo discreto (A · descubrible-calmo),
 * bajo el techo de la línea-veredicto (tamaño ≤ caption, contraste ≤ ink, sin badges/relleno).
 * El descubrimiento se resuelve en el INSTANTE del aterrizaje, no con peso permanente.
 *
 * ÉNFASIS DE ATERRIZAJE (`landNonce`): al aterrizar la card, un subrayado accent one-shot
 * bajo el label lo hace descubrir — el MISMO latido que el `land-flash` de la card (misma
 * curva/duración, disparado por el mismo `useLandingBeat`), no una segunda animación.
 * Accent SOLO en ese instante; luego reposa en ink, sin persistencia (nada de "no leído").
 *
 * ESPEJA el lenguaje del toggle del shell (mismo chevron `›` que rota 90°, misma familia de
 * label micro uppercase ink). FIREWALL: reposo y énfasis usan SOLO ink/accent — jamás color
 * de mercado. A11y: `<button aria-expanded>` real, teclado, foco accent global (globals.css).
 * Reveal con el token EXISTENTE `fade-slide-in`; reduced-motion omite reveal y énfasis
 * (blanket globals + `motion-safe:`/`motion-reduce:`) → reposo descubrible sin animación.
 * Caso vacío: el llamador NO monta `<Razonamiento>` si no hay contenido (sin toggle vacío).
 */
export function Razonamiento({
  label = 'razonamiento',
  defaultOpen = false,
  landNonce = 0,
  className,
  children,
}: {
  label?: string;
  defaultOpen?: boolean;
  /**
   * Latido de aterrizaje (de `useLandingBeat(status)`, pasado por la card). Al subir,
   * dispara el subrayado accent one-shot de descubrimiento. 0 = sin énfasis (p.ej. antes
   * del aterrizaje, o al montar ya-aterrizada en un run persistido → honestidad).
   */
  landNonce?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('mt-2 border-t border-ink/8 pt-2', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 py-1 text-left font-mono text-fluid-micro font-medium uppercase tracking-wider text-ink/70 transition-colors hover:text-ink/90 active:text-ink"
      >
        <span
          className={cn('leading-none text-ink/60 transition-transform duration-200', open && 'rotate-90')}
          aria-hidden="true"
        >
          ›
        </span>
        <span className="relative">
          {label}
          {/* Énfasis de aterrizaje: subrayado accent one-shot bajo el label, atado al
              latido REAL (`landNonce`). `key` lo remonta en cada aterrizaje nuevo; reposo
              queda en ink (sin persistencia). reduced-motion lo oculta. */}
          {landNonce > 0 && (
            <span
              key={landNonce}
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-0.5 left-0 h-px w-full origin-left bg-accent animate-reasoning-land motion-reduce:hidden"
            />
          )}
        </span>
      </button>
      {open && <div className="pt-0.5 motion-safe:animate-fade-slide-in">{children}</div>}
    </div>
  );
}
