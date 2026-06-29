'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/browser';
import { Monogram } from '@/components/symbols';

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
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.user && data.session) {
      // Confirmación de email desactivada en Supabase → signUp ya devuelve sesión.
      router.push('/analysis');
      router.refresh();
    } else {
      // Confirmación activada: NO hay sesión hasta confirmar. El enlace del email
      // lleva a /auth/confirm, que canjea el token y crea la sesión.
      setInfo(
        'Cuenta creada. Te enviamos un email de confirmación — mira también spam/promociones. El enlace caduca, confírmalo cuanto antes.'
      );
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 flex flex-col items-center">
        <Monogram className="h-12 w-12 text-ink mb-3" title="A.D.A.M." />
        <div className="font-sans text-2xl font-extrabold tracking-[0.2em] text-ink">A.D.A.M.</div>
        <div className="mt-2 font-mono text-[12px] tracking-[0.18em] text-ink/66 uppercase text-center">
          Detect the unseen
        </div>
        <div className="mt-1 font-mono text-[12px] tracking-wider text-ink/45 uppercase">
          Anomaly Detection &amp; Analysis Module
        </div>
      </div>

      <div className="rounded-[15px] border border-white/10 bg-surface-2 p-5">
        <h1 className="font-sans text-[14px] font-bold tracking-wider text-ink mb-1">CREAR CUENTA</h1>
        <p className="font-mono text-[12px] text-ink/66 mb-4">Built to detect what others ignore.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label="NOMBRE DISPLAY (opcional)">
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-ink placeholder-ink/45 focus:border-accent"
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
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-ink placeholder-ink/45 focus:border-accent"
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
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] text-ink placeholder-ink/45 focus:border-accent"
              placeholder="••••••••"
            />
          </Field>

          {error && (
            <div role="alert" className="rounded-lg border border-white/30 bg-white/[0.05] px-3 py-2 font-mono text-[12px] text-ink animate-blink-slow">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-white/20 bg-white/[0.04] px-3 py-2 font-mono text-[12px] text-ink/85">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg border border-ink bg-ink px-3 py-2.5 font-sans text-[11px] font-bold tracking-[0.15em] text-void transition hover:bg-ink/85 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'CREANDO...' : 'CREAR CUENTA ▶'}
          </button>
        </form>

        <div className="mt-4 border-t border-white/5 pt-3 text-center">
          <Link href="/login" className="font-mono text-[12px] text-accent transition hover:opacity-80">
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
      <span className="mb-1 block font-mono text-[12px] uppercase tracking-wider text-ink/66">{label}</span>
      {children}
    </label>
  );
}
