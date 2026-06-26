import Link from 'next/link';

/**
 * SiteFooter — pie de /inicio: wordmark + nota legal + enlaces. Chrome puro.
 */
const LINKS = [
  { href: '#como', label: 'Cómo funciona' },
  { href: '#sistema', label: 'El sistema' },
  { href: '#limites', label: 'Límites' },
  { href: '/analysis', label: 'Abrir análisis' },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink/10 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-5 px-5 sm:px-10">
        <div className="flex flex-col gap-3">
          <a href="#top" aria-label="A.D.A.M. — inicio" className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="rgba(245,245,247,.20)" />
              <circle cx="12" cy="12" r="6" stroke="rgba(245,245,247,.14)" />
              <circle cx="12" cy="12" r="2.2" fill="var(--accent)" />
            </svg>
            <span className="font-sans text-[0.95rem] font-extrabold tracking-[0.1em]">A.D.A.M.</span>
          </a>
          <p className="max-w-md font-mono text-[0.7rem] leading-relaxed text-ink/45">
            Anomaly Detection &amp; Analysis Module · copiloto de análisis, no un broker · educativo,
            no constituye asesoramiento financiero regulado.
          </p>
        </div>
        <nav aria-label="Pie" className="flex flex-wrap gap-5">
          {LINKS.map((l) =>
            l.href.startsWith('/') ? (
              <Link key={l.label} href={l.href} className="text-[0.9rem] text-ink/58 transition-colors hover:text-ink">
                {l.label}
              </Link>
            ) : (
              <a key={l.label} href={l.href} className="text-[0.9rem] text-ink/58 transition-colors hover:text-ink">
                {l.label}
              </a>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
