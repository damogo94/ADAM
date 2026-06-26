import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Eyebrow mono con marca de calibre (acento). Chrome, nunca market-color. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-ink/58 before:h-px before:w-[18px] before:bg-accent/80 before:content-['']",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  id?: string;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-4 font-sans text-fluid-h2 font-bold tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {sub ? <p className="mt-4 max-w-xl text-fluid-lead leading-[1.55] text-ink/72">{sub}</p> : null}
    </div>
  );
}
