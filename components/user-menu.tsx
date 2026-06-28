'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

/**
 * UserMenu — esquina superior derecha del header.
 * Muestra el email del user logueado y un botón para hacer logout.
 * Si no hay sesión, no renderiza nada.
 */
export function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!email) return null;

  async function logout() {
    setLoading(true);
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1 transition hover:border-accent/40"
        aria-label="User menu"
      >
        <span className="font-sans text-[12px] font-bold text-ink">{initials}</span>
        <span className="text-[12px] text-slate-l">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-white/10 bg-surface-2 shadow-xl z-50">
          <div className="border-b border-white/5 px-3 py-2">
            <div className="font-mono text-[12px] uppercase tracking-wider text-white/66 mb-0.5">Sesión</div>
            <div className="truncate font-mono text-[11px] text-white">{email}</div>
          </div>
          <button
            onClick={logout}
            disabled={loading}
            className="block w-full px-3 py-2 text-left font-mono text-[11px] text-ink/70 hover:bg-ink/[0.06] hover:text-ink transition disabled:opacity-50"
          >
            {loading ? 'cerrando...' : 'cerrar sesión ▶'}
          </button>
        </div>
      )}
    </div>
  );
}
