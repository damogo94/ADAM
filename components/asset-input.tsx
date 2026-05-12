'use client';

import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';

interface AssetInputProps {
  onSubmit: (ticker: string) => void;
  disabled?: boolean;
}

export function AssetInput({ onSubmit, disabled }: AssetInputProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    onSubmit(ticker);
  }

  return (
    <section className="relative mx-4 mt-3 overflow-hidden rounded-[18px] border border-blue-500/[0.22] bg-gradient-to-br from-blue-500/[0.07] to-cyan-500/[0.03] px-3.5 py-3.5">
      {/* top-edge glow line */}
      <div className="absolute inset-x-[10%] top-px h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />

      <p className="mb-2 flex items-center gap-1 font-mono text-[8px] font-medium uppercase tracking-[0.12em] text-a1">
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
            'flex-1 rounded-[11px] border border-white/[0.07] bg-black/35 px-3.5 py-2.5',
            'font-orbitron text-[22px] font-bold uppercase tracking-[0.12em] text-white',
            'caret-a1 outline-none transition-[border-color,box-shadow]',
            'placeholder:font-mono placeholder:text-[10px] placeholder:font-light placeholder:tracking-[0.04em] placeholder:normal-case placeholder:text-slate',
            'focus:border-a1/45 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
            'disabled:opacity-30'
          )}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className={cn(
            'flex h-[50px] w-[50px] flex-shrink-0 items-center justify-center rounded-xl border-0 text-[17px] text-white transition-all',
            'bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]',
            'shadow-[0_0_24px_rgba(37,99,235,0.45),0_4px_12px_rgba(0,0,0,0.4)]',
            'hover:from-[#3b82f6] hover:to-[#2563eb]',
            'disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none'
          )}
          aria-label="Iniciar análisis"
        >
          ▶
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[8px] text-slate-l">
        <span className="rounded border border-white/5 bg-white/[0.04] px-1.5 py-0.5">Investing.com</span>
        <span className="text-[9px] text-slate">·</span>
        <span className="rounded border border-white/5 bg-white/[0.04] px-1.5 py-0.5">Bloomberg</span>
        <span className="text-[9px] text-slate">·</span>
        <span className="rounded border border-white/5 bg-white/[0.04] px-1.5 py-0.5">TradingView</span>
      </div>
    </section>
  );
}
