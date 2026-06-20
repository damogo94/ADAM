'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/browser';
import { Monogram } from '@/components/symbols';

/**
 * Valida un raw `next` query param contra open-redirect.
 * - Sólo permite paths internos `/foo` (not `//foo`, ni `http://...`, ni `/\foo`).
 * - Fallback a `/analysis` para cualquier valor sospechoso o null.
 */
function safeNext(raw: string | null): string {
  if (!raw) return '/analysis';
  if (!raw.startsWith('/')) return '/analysis';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/analysis';
  return raw;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm h-64" />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 flex flex-col items-center">
        <Monogram className="h-12 w-12 text-white mb-3" title="A.D.A.M." />
        <div className="font-orbitron text-2xl font-black tracking-[0.18em] text-white">A.D.A.M.</div>
        <div className="mt-2 font-mono text-[12px] tracking-[0.18em] text-white/66 uppercase text-center">
          Detect the unseen
        </div>
        <div className="mt-1 font-mono text-[12px] tracking-wider text-white/45 uppercase">
          Anomaly Detection &amp; Analysis Modular
        </div>
      </div>

      <div className="rounded-[15px] border border-white/10 bg-surface-2 p-5">
        <h1 className="font-sans text-[14px] font-bold tracking-wider text-white mb-1">ACCESO</h1>
        <p className="font-mono text-[12px] text-white/66 mb-4">Access is earned.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label="EMAIL">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-white placeholder-slate focus:border-a1/60 focus:outline-none"
              placeholder="tu@email.com"
            />
          </Field>
          <Field label="PASSWORD">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-white placeholder-slate focus:border-a1/60 focus:outline-none"
              placeholder="••••••••"
            />
          </Field>

          {error && (
            <div className="rounded-lg border border-white/30 bg-white/[0.05] px-3 py-2 font-mono text-[12px] text-white animate-blink-slow">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg border border-white bg-white px-3 py-2.5 font-sans text-[11px] font-bold tracking-[0.15em] text-black transition hover:bg-white/85 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'AUTENTICANDO...' : 'ENTRAR ▶'}
          </button>
        </form>

        <div className="mt-4 border-t border-white/5 pt-3 text-center">
          <Link
            href="/signup"
            className="font-mono text-[12px] text-accent transition hover:opacity-80"
          >
            ¿Primera vez? · crear cuenta →
          </Link>
        </div>
      </div>

      <p className="mt-4 text-center font-mono text-[12px] text-white/45 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[12px] uppercase tracking-wider text-white/66">{label}</span>
      {children}
    </label>
  );
}
