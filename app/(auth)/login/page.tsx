'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/analysis';

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
      <div className="mb-6 text-center">
        <div className="font-orbitron text-2xl font-black tracking-[0.15em] text-white">A.D.A.M.</div>
        <div className="mt-1 font-mono text-[9px] tracking-wider text-slate uppercase">
          Anomaly Detection · Mission Control
        </div>
      </div>

      <div className="rounded-[15px] border border-white/5 bg-surface-2 p-5">
        <h1 className="font-orbitron text-[14px] font-bold tracking-wider text-white mb-1">ACCESO</h1>
        <p className="font-mono text-[9px] text-slate mb-4">Identifícate para operar el sistema</p>

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
            <div className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 font-mono text-[10px] text-rose">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-a1 px-3 py-2.5 font-orbitron text-[11px] font-bold tracking-wider text-white transition hover:bg-a1/80 disabled:opacity-50"
          >
            {loading ? 'AUTENTICANDO...' : 'ENTRAR ▶'}
          </button>
        </form>

        <div className="mt-4 border-t border-white/5 pt-3 text-center">
          <Link
            href="/signup"
            className="font-mono text-[10px] text-slate-l hover:text-a1 transition"
          >
            ¿Primera vez? · crear cuenta →
          </Link>
        </div>
      </div>

      <p className="mt-4 text-center font-mono text-[8px] text-slate opacity-60 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[8px] uppercase tracking-wider text-slate">{label}</span>
      {children}
    </label>
  );
}
