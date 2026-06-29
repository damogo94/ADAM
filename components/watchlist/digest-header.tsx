'use client';

import { cn } from '@/lib/utils';
import type { DigestEntry_t } from '@/lib/radar/types';

/**
 * Cabecera "3 cosas que mirar hoy" — sintetiza la lista en máximo 3
 * puntos: signals CMT unacked + deltas relevantes (decisión E de FASE 0).
 *
 * Cuando la lista está vacía (radar limpio sin alertas) renderiza un
 * estado idle discreto en vez de pantalla en blanco.
 *
 * Click en una entrada → propaga al callback `onSelect(ticker)`. La page
 * decide qué hacer (scroll-to, highlight, etc.) — el componente no
 * navega por su cuenta para no romper la regla "click no lleva a /analysis".
 */

interface DigestHeaderProps {
  entries: DigestEntry_t[];
  onSelect?: (ticker: string) => void;
  /** Marca de tiempo de cuando se generó el radar (ya viene del server). */
  generatedAt?: string;
}

const SEVERITY_META = {
  high: { dot: 'bg-rose', text: 'text-rose', border: 'border-rose/30' },
  medium: { dot: 'bg-amber', text: 'text-amber', border: 'border-amber/25' },
  low: { dot: 'bg-emerald', text: 'text-emerald', border: 'border-emerald/25' },
} as const;

export function DigestHeader({ entries, onSelect, generatedAt }: DigestHeaderProps) {
  const isEmpty = entries.length === 0;

  return (
    <div className="mx-4 rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="font-sans text-[12px] font-bold uppercase tracking-[0.12em] text-ink">
          3 cosas que mirar hoy
        </div>
        {generatedAt && (
          <div
            className="font-mono text-[12px] text-ink/66"
            title={new Date(generatedAt).toLocaleString()}
          >
            {timeAgo(generatedAt)}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="flex items-center gap-1.5 py-1 font-mono text-[11px] text-ink/66">
          <span className="h-1 w-1 rounded-full bg-white/45 animate-blink-slow" />
          <span>radar limpio · sin alertas ni cambios relevantes</span>
        </div>
      ) : (
        <ul className="space-y-1">
          {entries.map((e, i) => {
            const meta = SEVERITY_META[e.severity];
            const content = (
              <div className="flex items-center gap-2">
                <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', meta.dot)} />
                <span className={cn('font-sans text-[11px] font-bold tracking-wider', meta.text)}>
                  {e.ticker}
                </span>
                <span className="font-mono text-[12px] text-ink/75 truncate">{e.reason}</span>
                <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-ink/66">
                  {e.source === 'signal' ? 'CMT' : 'Δ'}
                </span>
              </div>
            );

            // Botón si hay handler, div estático si no — evitamos role="button"
            // sin handler que confunde lectores de pantalla.
            return onSelect ? (
              <li key={`${e.ticker}-${i}`}>
                <button
                  type="button"
                  onClick={() => onSelect(e.ticker)}
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-left transition',
                    meta.border,
                    'bg-white/[0.02] hover:bg-white/[0.05]'
                  )}
                  aria-label={`${e.ticker}: ${e.reason}`}
                >
                  {content}
                </button>
              </li>
            ) : (
              <li
                key={`${e.ticker}-${i}`}
                className={cn('rounded-md border px-2 py-1.5', meta.border, 'bg-white/[0.02]')}
              >
                {content}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "hace 3 min", "hace 2 h" — formato corto para el header. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const d = Math.floor(hr / 24);
  return `hace ${d}d`;
}
