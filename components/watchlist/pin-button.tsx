'use client';

import { cn } from '@/lib/utils';

/**
 * Botón pin/unpin del panel de watchlist.
 *
 * Estado visual:
 *   - pinned=true  → icono ◆ relleno + título "Quitar de fijados"
 *   - pinned=false → icono ◇ contorno + título "Fijar arriba"
 *
 * NO usamos emojis (no se ven igual en todas las plataformas, y la estética
 * del sistema es tipográfica). Usamos un símbolo unicode dentro del aspect
 * cuadrado consistente con otros mini-botones de la fila.
 */

interface PinButtonProps {
  pinned: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function PinButton({ pinned, onToggle, disabled }: PinButtonProps) {
  const label = pinned ? 'Quitar de fijados' : 'Fijar arriba';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border transition',
        pinned
          ? 'border-white/40 bg-white/[0.08] text-white'
          : 'border-white/10 bg-white/[0.02] text-white/66 hover:border-white/30 hover:text-white/85',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      <span aria-hidden="true" className="text-[12px] leading-none">
        {pinned ? '◆' : '◇'}
      </span>
    </button>
  );
}
