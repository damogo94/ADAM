/**
 * Clases compartidas de botón/CTA para /inicio. Chrome puro: ink/surface +
 * acento; nunca market-color. Targets ≥44px (WCAG 2.2). El `group` habilita el
 * micro-desplazamiento de la flecha en hover (usar `<span className="arw">`).
 */
export const btnBase =
  'group inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 font-mono text-[0.8125rem] font-semibold uppercase tracking-[0.04em] transition-[transform,background-color,border-color,opacity,box-shadow] duration-150 active:translate-y-px';

export const btnPrimary = 'bg-ink text-void shadow-e1 hover:shadow-e2';

export const btnGhost = 'border border-ink/15 text-ink hover:border-ink/25 hover:bg-ink/[0.04]';

/** Flecha → con micro-desplazamiento en hover del grupo. */
export const arw = 'transition-transform duration-200 group-hover:translate-x-[3px]';
