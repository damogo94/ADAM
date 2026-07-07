'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { arw, btnBase, btnGhost, btnPrimary } from './lib/ui';

/**
 * SiteHeader — cabecera sticky de /inicio. Al hacer scroll gana blur + borde y
 * el CTA primario "Abrir análisis" sube de ghost a primary (DELTA 8: un único
 * punto de conversión enfático). Nav por anclas con scroll-spy (subrayado accent
 * en la sección activa) — chrome, nunca market-color.
 */
const NAV = [
  { href: '#como', label: 'Cómo funciona', id: 'como' },
  { href: '#sistema', label: 'El sistema', id: 'sistema' },
  { href: '#limites', label: 'Límites', id: 'limites' },
];

/**
 * BrandMark vivo — el núcleo nace de la Constellation del hero (eventos
 * `adam:core-birth` → oculto en espera · `adam:core-docked` → aterriza con
 * rebote), late al cruzar de sección (beatN re-monta el <g> del latido) y dos
 * satélites dan una órbita al hover del logo. Sin coreografía (no-JS, reduced
 * motion, otras rutas) el núcleo es estático: `core === 'static'`.
 */
function BrandMark({
  core,
  beatN,
  onSettled,
}: {
  core: 'static' | 'waiting' | 'docked';
  beatN: number;
  onSettled: () => void;
}) {
  const fillBox = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px] shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="rgba(245,245,247,.20)" />
      <circle cx="12" cy="12" r="6" stroke="rgba(245,245,247,.14)" />
      <g key={beatN} className={beatN > 0 ? 'animate-core-beat' : undefined} style={fillBox}>
        <circle
          data-brand-core
          cx="12"
          cy="12"
          r="2.2"
          fill="var(--accent)"
          className={
            core === 'waiting' ? 'opacity-0' : core === 'docked' ? 'animate-core-arrive' : undefined
          }
          style={fillBox}
          onAnimationEnd={(e) => {
            // asentarse tras aterrizar: si no, el remount del latido (key=beatN)
            // relanzaría coreArrive en cada cruce de sección
            if (e.animationName === 'coreArrive') onSettled();
          }}
        />
      </g>
      {/* Satélites: una órbita al hover del logo (rotación sobre el centro del viewBox) */}
      <g
        className="opacity-0 group-hover:animate-orbit-once motion-reduce:hidden"
        style={{ transformBox: 'view-box', transformOrigin: 'center' }}
      >
        <circle cx="12" cy="2" r="1.1" fill="var(--accent)" opacity=".85" />
        <circle cx="22" cy="12" r="0.9" fill="rgba(245,245,247,.6)" />
      </g>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="rgba(91,138,240,.32)" />
    </svg>
  );
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [core, setCore] = useState<'static' | 'waiting' | 'docked'>('static');
  const [beatN, setBeatN] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Nacimiento del núcleo: la Constellation del hero avisa por eventos (sin
  // duplicar timings). Si nunca llegan (reduced-motion/no hero), queda estático.
  useEffect(() => {
    const onBirth = () => setCore('waiting');
    const onDocked = () => setCore('docked');
    window.addEventListener('adam:core-birth', onBirth);
    window.addEventListener('adam:core-docked', onDocked);
    return () => {
      window.removeEventListener('adam:core-birth', onBirth);
      window.removeEventListener('adam:core-docked', onDocked);
    };
  }, []);

  // Latido al cruzar de sección (reusa el scroll-spy). Nunca durante la espera
  // del nacimiento (el aterrizaje manda); un beat suelto al cargar con ancla
  // es aceptable.
  useEffect(() => {
    if (!activeId || core === 'waiting') return;
    setBeatN((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const sections = NAV.map((n) => document.getElementById(n.id)).filter(
      (el): el is HTMLElement => el != null,
    );
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.id);
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-ink/10 bg-void/70 backdrop-blur-xl backdrop-saturate-150'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-10">
        <a
          href="#top"
          aria-label="A.D.A.M. — inicio"
          className="group flex shrink-0 items-center gap-3"
        >
          <BrandMark core={core} beatN={beatN} onSettled={() => setCore('static')} />
          <span className="font-sans text-[0.95rem] font-extrabold tracking-[0.1em]">A.D.A.M.</span>
        </a>

        <nav aria-label="Secciones" className="ml-4 hidden gap-6 min-[880px]:flex">
          {NAV.map((n) => {
            const on = activeId === n.id;
            return (
              <a
                key={n.id}
                href={n.href}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'relative py-2 text-[0.9rem] transition-colors',
                  on ? 'text-ink' : 'text-ink/58 hover:text-ink',
                )}
              >
                {n.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent transition-transform duration-300',
                    on ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/login"
            className="hidden min-h-[44px] items-center text-[0.9rem] text-ink/58 transition-colors hover:text-ink sm:inline-flex"
          >
            Entrar
          </Link>
          <Link
            href="/analysis"
            className={cn(btnBase, 'text-[0.78rem]', scrolled ? btnPrimary : btnGhost)}
          >
            Abrir análisis
            <span aria-hidden="true" className={arw}>
              →
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
