'use client';

/**
 * <Glossed term="confluencia">…contenido…</Glossed>
 *
 * Subraya un término técnico (dashed) y, al hacer click/tap, abre un popover
 * con su explicación del glosario. SIEMPRE activo: si `term` tiene entrada en
 * el glosario, el contenido es interactivo; si no la tiene, passthrough total.
 *
 * (Ya NO existe el modo prosumer/educativo — la glosa es permanente. El
 * watchlist es la pantalla donde se aprende.)
 *
 * INVARIANTE: NO cambia el contenido del children. Si pasas un número, sale
 * el mismo número; si pasas un badge, sale el mismo badge. La lente solo
 * añade el affordance (subrayado) + la explicación adyacente.
 *
 * El popover se renderiza en un PORTAL (document.body) con posición fixed
 * calculada desde el rect del trigger. Esto lo libera de cualquier ancestro
 * con `overflow:hidden` (p.ej. el `truncate` de las celdas del radar), que de
 * otro modo lo recortaría.
 *
 * Accesibilidad:
 *   - <button> real (Enter/Space lo activan) con aria-expanded.
 *   - aria-describedby → nodo sr-only permanente con "label: explicación",
 *     así el lector de pantalla lo anuncia al enfocar (no depende del popover).
 *   - Cierre con Esc, click fuera, y scroll/resize. Solo popover (sin title).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { lookup } from '@/lib/lens/glossary';

interface GlossedProps {
  term: string;
  children: React.ReactNode;
  /** Estilo del subrayado del affordance. */
  variant?: 'underline' | 'dashed';
}

interface PopoverPos {
  top: number;
  left: number;
  width: number;
  placement: 'top' | 'bottom';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function Glossed({ term, children, variant = 'dashed' }: GlossedProps) {
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const descId = useId();

  const entry = lookup(term);
  const open = pos !== null;

  const close = useCallback(() => setPos(null), []);

  const openPopover = useCallback(() => {
    const el = triggerRef.current;
    if (typeof window === 'undefined' || !el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth * 0.82);
    const half = width / 2;
    const estH = 110; // estimación de alto para decidir arriba/abajo
    const below = r.bottom + estH + 8 < window.innerHeight;
    setPos({
      top: below ? r.bottom + 6 : r.top - 6,
      left: clamp(r.left + r.width / 2, half + 8, window.innerWidth - half - 8),
      width,
      placement: below ? 'bottom' : 'top',
    });
  }, []);

  // Cierre con Esc, click fuera (trigger o popover), scroll y resize.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  // Sin entrada de glosario → passthrough total (cero affordance).
  if (!entry) {
    return <>{children}</>;
  }

  return (
    <span className="relative inline">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-describedby={descId}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else openPopover();
        }}
        className={cn(
          'inline cursor-help border-0 bg-transparent p-0 align-baseline text-inherit',
          'rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50',
          variant === 'dashed'
            ? 'border-b border-dashed border-white/45'
            : 'underline decoration-dotted decoration-white/45 underline-offset-2'
        )}
      >
        {children}
      </button>

      {/* Descripción permanente para lectores de pantalla (aria-describedby). */}
      <span id={descId} className="sr-only">
        {entry.label}: {entry.explanation}
      </span>

      {/* Popover visual en portal (escapa overflow:hidden de las celdas). */}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={popRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              transform:
                pos.placement === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }}
            className={cn(
              'z-[60] block rounded-[10px] border border-white/15 bg-surface-2 px-3 py-2 text-left normal-case',
              'shadow-[0_8px_24px_rgba(0,0,0,0.6)]'
            )}
          >
            <span className="mb-0.5 block font-sans text-[11px] font-bold tracking-wider text-ink">
              {entry.label}
            </span>
            <span className="block font-mono text-[11px] leading-snug text-ink/70">
              {entry.explanation}
            </span>
          </span>,
          document.body
        )}
    </span>
  );
}
