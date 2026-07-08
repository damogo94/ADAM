'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Razonamiento — desplegable de NIVEL 3 (divulgación progresiva de agent cards).
 *
 * Segundo toggle anidado dentro del cuerpo de un card: deja la señal
 * decision-grade (datos + titular) visible en el nivel 2 y pliega la prosa
 * narrativa / secciones secundarias por defecto.
 *
 * ESPEJA el lenguaje del toggle del shell (AgentCardShell): mismo chevron `›`
 * que rota 90°, misma familia de label (micro uppercase ink). Así los dos
 * toggles del card (nivel 1 del shell y nivel 3 anidado) se leen como hermanos.
 *
 * FIREWALL: el affordance usa SOLO ink/accent (chrome) — jamás color de mercado.
 * A11y: <button aria-expanded> real, operable por teclado. Reveal con el token
 * de entrada EXISTENTE `fade-slide-in` (motion-safe, sin curva nueva);
 * reduced-motion lo omite (globals.css corta transiciones + `motion-safe:`).
 * Ritmo: `mt-1.5` (6px) para sentarse en la escala de spacing del cuerpo.
 */
export function Razonamiento({
  label = 'razonamiento',
  defaultOpen = false,
  className,
  children,
}: {
  label?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('mt-1.5', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 py-1 text-left font-mono text-fluid-micro font-medium uppercase tracking-wider text-ink/66 transition-colors hover:text-ink/85"
      >
        <span
          className={cn('leading-none text-ink/45 transition-transform duration-200', open && 'rotate-90')}
          aria-hidden="true"
        >
          ›
        </span>
        {label}
      </button>
      {open && <div className="pt-0.5 motion-safe:animate-fade-slide-in">{children}</div>}
    </div>
  );
}
