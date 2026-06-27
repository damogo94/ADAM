'use client';

import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { resolveTicker } from '@/lib/catalog/assets';
import { AssetPicker } from '@/components/asset-picker';
import { btnBase, btnPrimary, arw } from '@/components/inicio/lib/ui';

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
      <section className="relative mx-4 mt-3 overflow-hidden rounded-card border border-ink/12 bg-surface-2 px-4 py-4 shadow-e1">
        {/* top-edge whisper line — calibre accent */}
        <div className="absolute inset-x-[10%] top-px h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        {/* Instrucción real (no jerga): qué escribir y cómo abrir el catálogo. */}
        <p className="mb-2.5 font-mono text-fluid-caption tracking-[0.04em] text-ink/58">
          Escribe un ticker — <span className="text-ink/85">AAPL · BTC · OIL</span> — o pulsa{' '}
          <span className="text-ink/85">⊞ Catálogo</span>
        </p>

        <form onSubmit={handleSubmit} className="mb-2.5 flex gap-2">
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
              'flex-1 rounded-lg border border-ink/12 bg-black/40 px-4 py-2.5',
              'font-mono text-fluid-h3 font-bold uppercase tracking-[0.12em] text-ink',
              'caret-accent outline-none transition-[border-color,box-shadow]',
              'placeholder:font-mono placeholder:text-fluid-label placeholder:font-light placeholder:tracking-[0.04em] placeholder:normal-case placeholder:text-ink/40',
              'focus:border-accent focus:shadow-[0_0_0_2px_rgba(91,138,240,0.22)]',
              'disabled:opacity-30'
            )}
          />
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className={cn(
              btnBase,
              btnPrimary,
              'w-[50px] flex-shrink-0 px-0 md:w-auto md:px-5',
              'disabled:cursor-not-allowed disabled:opacity-30'
            )}
            aria-label="Iniciar análisis"
          >
            {/* móvil: icono · ≥md: etiqueta explícita */}
            <span className="text-fluid-lead md:hidden" aria-hidden="true">▶</span>
            <span className="hidden md:inline">
              Analizar <span className={arw}>→</span>
            </span>
          </button>
        </form>

        {/* Catálogo: botón VISIBLE y etiquetado (descubrible sin depender del tooltip). */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className={cn(
            'inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-ink/12 bg-ink/[0.03] px-3',
            'font-mono text-fluid-caption text-ink/58 transition-colors',
            'hover:border-ink/25 hover:bg-ink/[0.06] hover:text-ink',
            'disabled:cursor-not-allowed disabled:opacity-30'
          )}
          aria-label="Abrir catálogo de activos"
          title="Catálogo de activos"
        >
          <span aria-hidden="true" className="text-fluid-label leading-none">⊞</span>
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
