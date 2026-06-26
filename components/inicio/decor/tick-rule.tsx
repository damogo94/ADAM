import { cn } from '@/lib/utils';

/**
 * Tick-rules — regla de calibre. Chrome puro (ink), nunca market-color.
 * Cada 5ª marca es más alta, como una escala graduada de instrumento.
 */
export function TickRow({ count = 9, className }: { count?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('flex h-3.5 items-end gap-[6px] opacity-50', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn('w-px', i % 5 === 0 ? 'h-3 bg-ink/45' : 'h-1.5 bg-ink/30')}
        />
      ))}
    </span>
  );
}

/** Divisor de calibre entre secciones: línea — tick-rule — línea. */
export function SectionDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('mx-auto flex w-full max-w-6xl items-center gap-4 px-5 sm:px-10', className)}
    >
      <span className="h-px flex-1 bg-ink/10" />
      <TickRow />
      <span className="h-px flex-1 bg-ink/10" />
    </div>
  );
}
