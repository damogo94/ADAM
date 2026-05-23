'use client';

/**
 * Toggle prosumer ↔ educativo. Persiste vía LensProvider.
 *
 * UI: switch tipográfico estilo segmented control. NUNCA cambia números
 * ni dictámenes — solo el lenguaje y las explicaciones inline.
 */

import { cn } from '@/lib/utils';
import { useLens, type LensMode } from '@/lib/lens/lens-provider';

const OPTIONS: { value: LensMode; label: string; hint: string }[] = [
  { value: 'prosumer', label: 'prosumer', hint: 'Lenguaje técnico — sin glosa.' },
  { value: 'educativo', label: 'educativo', hint: 'Mismos datos, explicaciones inline.' },
];

export function LensToggle() {
  const { mode, setMode } = useLens();
  return (
    <div
      role="radiogroup"
      aria-label="Modo de visualización"
      className="inline-flex items-center gap-px rounded-full border border-white/10 bg-black/40 p-px"
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => setMode(opt.value)}
            className={cn(
              'rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition',
              active
                ? 'bg-white text-black'
                : 'text-white/55 hover:text-white'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
