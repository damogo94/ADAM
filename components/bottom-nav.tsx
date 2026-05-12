'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { href: '/analysis', label: 'ANÁLISIS', icon: '⬡' },
  { href: '/watchlist', label: 'WATCHLIST', icon: '◈' },
  { href: '/signals', label: 'SEÑALES', icon: '⚡' },
  { href: '/system', label: 'SISTEMA', icon: '◎' },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-surface/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-1 pb-2">
      {ITEMS.map((it) => {
        const active = pathname?.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 pt-2 transition-opacity',
              active ? 'opacity-100' : 'opacity-40 hover:opacity-70'
            )}
          >
            <span className="text-lg leading-none">{it.icon}</span>
            <span className={cn('font-mono text-[8px] tracking-wider', active ? 'text-a1' : 'text-slate-l')}>
              {it.label}
            </span>
            <span className={cn('w-1 h-1 rounded-full bg-a1 transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
          </Link>
        );
      })}
    </nav>
  );
}
