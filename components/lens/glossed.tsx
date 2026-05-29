'use client';

/**
 * <Glossed term="confluencia">…contenido…</Glossed>
 *
 * Envoltorio que, en modo `educativo`, subraya el contenido y muestra
 * un tooltip con la explicación del glosario al pasar el cursor/foco.
 * En modo `prosumer` renderiza el children como si no estuviera ahí.
 *
 * INVARIANTE: NO cambia el contenido del children. Si pasas un número,
 * sale el mismo número. Si pasas el badge de anomalía, sale el mismo
 * badge. La lente solo añade affordance visual + explicación adyacente.
 *
 * Accesibilidad:
 *   - role="button" + tabIndex=0 cuando hay glosa activa (educativo).
 *   - title= con la explicación (tooltip nativo, sin JS extra).
 *   - aria-describedby señalando el tooltip oculto cuando aplica.
 */

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { useLens } from '@/lib/lens/lens-provider';
import { lookup } from '@/lib/lens/glossary';

interface GlossedProps {
  term: string;
  children: React.ReactNode;
  /** Estilo del subrayado en modo educativo. */
  variant?: 'underline' | 'dashed';
  /** Forzar el modo (útil para tests). Si no se pasa, usa el provider. */
  forceMode?: 'prosumer' | 'educativo';
}

export function Glossed({ term, children, variant = 'dashed', forceMode }: GlossedProps) {
  const { mode } = useLens();
  const active = (forceMode ?? mode) === 'educativo';
  const id = useId();

  const entry = lookup(term);

  // En prosumer o sin entrada de glosario válida: passthrough total.
  if (!active || !entry) {
    return <>{children}</>;
  }

  return (
    <span className="relative inline">
      <span
        tabIndex={0}
        role="button"
        aria-describedby={id}
        title={`${entry.label}: ${entry.explanation}`}
        className={cn(
          'cursor-help text-inherit',
          variant === 'dashed'
            ? 'border-b border-dashed border-white/40'
            : 'underline decoration-dotted underline-offset-2 decoration-white/40'
        )}
      >
        {children}
      </span>
      {/* Descripción para lectores de pantalla, referenciada por
          aria-describedby. Va con sr-only (no `hidden`): los elementos
          `hidden` se eliminan del árbol de accesibilidad, así que un
          aria-describedby apuntando a uno no resuelve a nada. sr-only lo
          mantiene invisible visualmente pero accesible al SR. El title=
          nativo sigue siendo el tooltip visual. */}
      <span id={id} className="sr-only">
        {entry.label}: {entry.explanation}
      </span>
    </span>
  );
}
