'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/browser';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
        emailRedirectTo: `${window.location.origin}/analysis`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.user && data.session) {
      // Auto-confirm activado en Supabase Auth → sesión inmediata
      router.push('/analysis');
      router.refresh();
    } else {
      setInfo('Cuenta creada. Revisa tu email para confirmarla antes de entrar.');
    }
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
        <h1 className="font-orbitron text-[14px] font-bold tracking-wider text-white mb-1">CREAR CUENTA</h1>
        <p className="font-mono text-[9px] text-slate mb-4">Alta de operador del sistema</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label="NOMBRE DISPLAY (opcional)">
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-white placeholder-slate focus:border-a1/60 focus:outline-none"
              placeholder="ej. Trader_01"
            />
          </Field>
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
          <Field label="PASSWORD (mínimo 6 caracteres)">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
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
          {info && (
            <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2 font-mono text-[10px] text-emerald">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-a1 px-3 py-2.5 font-orbitron text-[11px] font-bold tracking-wider text-white transition hover:bg-a1/80 disabled:opacity-50"
          >
            {loading ? 'CREANDO...' : 'CREAR CUENTA ▶'}
          </button>
        </form>

        <div className="mt-4 border-t border-white/5 pt-3 text-center">
          <Link href="/login" className="font-mono text-[10px] text-slate-l hover:text-a1 transition">
            ¿Ya tienes cuenta? · entrar →
          </Link>
        </div>
      </div>
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
