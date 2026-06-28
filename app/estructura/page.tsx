'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';
import { AssetInput } from '@/components/asset-input';
import { SectionLabel } from '@/components/section-label';
import { EstructuraCard } from '@/components/agents/estructura-card';
import { resolveError, networkError, type UserError } from '@/lib/errors';
import { postEstructura } from '@/lib/estructura/post';
import { cn } from '@/lib/utils';
import type { AgentStatus } from '@/components/agent-card-shell';
import type { EstructuraOutput_t } from '@/agents/estructura/schema';

type EstructuraResult = EstructuraOutput_t & { data_symbol?: string };

export default function EstructuraScreen() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-void" />}>
      <EstructuraInner />
    </Suspense>
  );
}

function EstructuraInner() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [data, setData] = useState<EstructuraResult | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const search = useSearchParams();
  const autoTicker = search.get('ticker');
  const autoRanRef = useRef<string | null>(null);

  useEffect(() => {
    if (autoTicker && autoRanRef.current !== autoTicker) {
      autoRanRef.current = autoTicker;
      void handleRun(autoTicker.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTicker]);

  async function handleRun(raw: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setTicker(raw);
    setStatus('scanning');
    setData(null);
    setError(null);

    try {
      const res = await postEstructura(raw, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const json = await res.json();
      if (ctrl.signal.aborted) return;

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login?next=/estructura');
          return;
        }
        setStatus('error');
        setError(resolveError(json));
        return;
      }

      const out = json as EstructuraResult;
      setData(out);
      setStatus(out.setup.estado === 'listo' ? 'anomaly' : 'done');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setStatus('error');
      setError(networkError(e));
    }
  }

  const isLoading = status === 'scanning';
  const headerStatus = error ? 'error' : status === 'done' || status === 'anomaly' ? 'ok' : isLoading ? 'running' : 'offline';
  const isIdle = ticker === null && !error;

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-3xl">
      <Header status={headerStatus} tagline="Agente de Estructura · Price Action MTF" />

      <AssetInput onSubmit={handleRun} disabled={isLoading} />

      {/* Vuelta al análisis multiagente completo. */}
      <div className="mx-4 mt-2 flex items-center justify-end gap-1.5 font-mono text-[11px] text-white/55">
        <Link
          href="/analysis"
          className="text-accent underline-offset-2 transition-colors hover:opacity-80 hover:underline"
        >
          ← Análisis multiagente
        </Link>
      </div>

      {error && (
        <div
          className={cn(
            'mx-4 mt-3 rounded-lg border px-3 py-2.5',
            error.tone === 'auth' && 'border-white/15 bg-white/[0.03]',
            error.tone === 'transient' && 'border-white/20 bg-white/[0.05]',
            error.tone === 'rate_limit' && 'border-white/25 bg-white/[0.06]',
            error.tone === 'fatal' && 'border-white/40 bg-white/[0.10]'
          )}
        >
          <div className="mb-0.5 font-sans text-[12px] font-bold tracking-wider text-white/85">
            {error.title}
          </div>
          <div className="font-mono text-[12px] leading-snug text-white/85">{error.message}</div>
        </div>
      )}

      {isIdle && <OnboardingCard />}

      <SectionLabel>plan de estructura</SectionLabel>
      <div className="px-4">
        <EstructuraCard status={status} data={data} ticker={ticker} />
      </div>

      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-white/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

function OnboardingCard() {
  const pasos: { n: string; t: string; d: string }[] = [
    { n: '1', t: 'Escribe tu activo', d: 'XAUUSD · NAS100 · US500 — tu nomenclatura de futuros' },
    { n: '2', t: 'Lee la estructura', d: 'contexto Weekly/Daily, rango operativo y zona de "rompe y apoya"' },
    { n: '3', t: 'Sigue el plan', d: 'entrada, stop estructural y objetivo con R/B ≥ 1.5, si hay setup' },
  ];
  return (
    <section className="mx-4 mt-3 overflow-hidden rounded-[18px] border border-white/8 bg-surface-2 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-sans text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
          cómo funciona
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {pasos.map((s) => (
          <div key={s.n} className="flex gap-2.5 rounded-[12px] border border-white/5 bg-white/[0.015] px-3 py-2.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/15 font-sans text-[12px] font-bold text-white/80">
              {s.n}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[12px] font-medium leading-tight text-white/85">{s.t}</div>
              <div className="mt-0.5 font-mono text-[11px] leading-snug text-white/66">{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
