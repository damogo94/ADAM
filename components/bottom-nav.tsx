'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { AnomalyLoop, SplitA, Observer, Monogram, Origin } from './symbols';

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string; title?: string }>;
}

/**
 * Iconos del bottom-nav = symbol library del brand system.
 * Asignación inicial (extensible — añadir items aquí cuando crezcan
 * las screens). Cada icono hereda currentColor, así la opacidad activa
 * vs. inactiva se controla con `text-white` / `text-white/66` arriba.
 */
const ITEMS: NavItem[] = [
  { href: '/inicio', label: 'INICIO', Icon: Origin },
  { href: '/analysis', label: 'ANÁLISIS', Icon: AnomalyLoop },
  { href: '/watchlist', label: 'WATCHLIST', Icon: SplitA },
  { href: '/signals', label: 'SEÑALES', Icon: Observer },
  { href: '/system', label: 'SISTEMA', Icon: Monogram },
];

export function BottomNav() {
  const pathname = usePathname();
  // SOLO UX: ocultamos "SISTEMA" salvo que el usuario esté en la allowlist.
  // Default oculto (no revela que /system existe); aparece si el check da true.
  // La seguridad real vive en servidor (layout + APIs), no aquí.
  const [systemAllowed, setSystemAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/system/access')
      .then((r) => (r.ok ? r.json() : { authorized: false }))
      .then((j: { authorized?: boolean }) => {
        if (alive) setSystemAllowed(j?.authorized === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const items = ITEMS.filter((it) => it.href !== '/system' || systemAllowed);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-void/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-1 pb-2">
      {items.map((it) => {
        const active = pathname?.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 pt-2 transition-opacity',
              active ? 'opacity-100' : 'opacity-40 hover:opacity-70'
            )}
          >
            <it.Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-white/66')} title={it.label} />
            <span
              className={cn(
                'font-mono text-[12px] tracking-wider',
                active ? 'text-accent' : 'text-white/66'
              )}
            >
              {it.label}
            </span>
            <span
              className={cn(
                'w-3 h-px transition-opacity bg-accent',
                active ? 'opacity-100' : 'opacity-0'
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
