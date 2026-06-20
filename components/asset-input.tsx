'use client';

import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { resolveTicker } from '@/lib/catalog/assets';
import { AssetPicker } from '@/components/asset-picker';

interface AssetInputProps {
  onSubmit: (ticker: string) => void;
  disabled?: boolean;
}

/**
 * Re-skin B&W: el AssetInput era el componente con más color hardcoded
 * (blue-500, cyan-500, sky-400, hex #2563eb). Ahora es monocromo puro
 * con un trazo whisper en el top edge y el botón ▶ en blanco sobre negro.
 *
 * PR1 Asset Picker: añade un trigger ⌘ que abre el bottom-sheet con
 * catálogo curado. Los aliases ("GOLD" → "XAU/USD") se resuelven en
 * `handleSubmit` para que un input libre mal escrito caiga al ticker
 * canónico sin quemar 5 llamadas a Claude.
 */
export function AssetInput({ onSubmit, disabled }: AssetInputProps) {
  const [value, setValue] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ticker = resolveTicker(value);
    if (!ticker) return;
    onSubmit(ticker);
  }

  function handlePick(ticker: string) {
    setValue(ticker);
    onSubmit(ticker);
  }

  return (
    <>
      <section className="relative mx-4 mt-3 overflow-hidden rounded-[18px] border border-white/15 bg-surface-2 px-3.5 py-3.5">
        {/* top-edge whisper line */}
        <div className="absolute inset-x-[10%] top-px h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        {/* Instrucción real (no jerga): qué escribir y cómo abrir el catálogo. */}
        <p className="mb-2 font-mono text-[11px] tracking-[0.04em] text-white/70">
          Escribe un ticker — <span className="text-white/90">AAPL · BTC · OIL</span> — o pulsa{' '}
          <span className="text-white/90">⊞ Catálogo</span>
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-2.5">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            disabled={disabled}
            placeholder="OIL · BTC · AAPL · GOLD · EUR/USD"
            maxLength={10}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoCapitalize="characters"
            className={cn(
              'flex-1 rounded-[11px] border border-white/10 bg-black/40 px-3.5 py-2.5',
              'font-mono text-[22px] font-bold uppercase tracking-[0.12em] text-white',
              'caret-white outline-none transition-[border-color,box-shadow]',
              'placeholder:font-mono placeholder:text-[14px] placeholder:font-light placeholder:tracking-[0.04em] placeholder:normal-case placeholder:text-white/66',
              'focus:border-white/40 focus:shadow-[0_0_0_2px_rgba(255,255,255,0.06)]',
              'disabled:opacity-30'
            )}
          />
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className={cn(
              'flex h-[50px] w-[50px] flex-shrink-0 items-center justify-center rounded-xl transition-all md:w-auto md:px-5',
              'border border-white bg-white text-black font-bold',
              'hover:bg-white/85 active:scale-95',
              'disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-white/40 disabled:border-white/40'
            )}
            aria-label="Iniciar análisis"
          >
            {/* móvil: icono · ≥md: etiqueta explícita */}
            <span className="text-[17px] md:hidden" aria-hidden="true">▶</span>
            <span className="hidden font-sans text-[12px] font-bold uppercase tracking-[0.1em] md:inline">
              Analizar →
            </span>
          </button>
        </form>

        {/* Catálogo: botón VISIBLE y etiquetado (descubrible sin depender del tooltip). */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-[11px] border border-white/15 bg-white/[0.04] px-3',
            'font-mono text-[11px] text-white/70 transition-all',
            'hover:border-white/40 hover:bg-white/[0.08] hover:text-white',
            'disabled:opacity-30 disabled:cursor-not-allowed'
          )}
          aria-label="Abrir catálogo de activos"
          title="Catálogo de activos"
        >
          <span aria-hidden="true" className="text-[13px] leading-none">⊞</span>
          Catálogo
        </button>
      </section>

      <AssetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePick}
      />
    </>
  );
}
