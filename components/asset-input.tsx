'use client';

import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';

interface AssetInputProps {
  onSubmit: (ticker: string) => void;
  disabled?: boolean;
}

/**
 * Re-skin B&W: el AssetInput era el componente con más color hardcoded
 * (blue-500, cyan-500, sky-400, hex #2563eb). Ahora es monocromo puro
 * con un trazo whisper en el top edge y el botón ▶ en blanco sobre negro.
 */
export function AssetInput({ onSubmit, disabled }: AssetInputProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    onSubmit(ticker);
  }

  return (
    <section className="relative mx-4 mt-3 overflow-hidden rounded-[18px] border border-white/15 bg-surface-2 px-3.5 py-3.5">
      {/* top-edge whisper line */}
      <div className="absolute inset-x-[10%] top-px h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      <p className="mb-2 flex items-center gap-1 font-mono text-[8px] font-medium uppercase tracking-[0.12em] text-white/65">
        <span className="text-[8px]">▸</span>
        activo — jerarquía superior · inicializa todos los agentes
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
            'font-orbitron text-[22px] font-bold uppercase tracking-[0.12em] text-white',
            'caret-white outline-none transition-[border-color,box-shadow]',
            'placeholder:font-mono placeholder:text-[10px] placeholder:font-light placeholder:tracking-[0.04em] placeholder:normal-case placeholder:text-white/30',
            'focus:border-white/40 focus:shadow-[0_0_0_2px_rgba(255,255,255,0.06)]',
            'disabled:opacity-30'
          )}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className={cn(
            'flex h-[50px] w-[50px] flex-shrink-0 items-center justify-center rounded-xl text-[17px] transition-all',
            'border border-white bg-white text-black font-bold',
            'hover:bg-white/85 active:scale-95',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-white/40 disabled:border-white/40'
          )}
          aria-label="Iniciar análisis"
        >
          ▶
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[8px] text-white/55">
        <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5">Investing.com</span>
        <span className="text-[9px] text-white/30">·</span>
        <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5">Bloomberg</span>
        <span className="text-[9px] text-white/30">·</span>
        <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5">TradingView</span>
      </div>
    </section>
  );
}
