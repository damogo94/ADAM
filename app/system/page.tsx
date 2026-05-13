'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';

interface SystemStats {
  analyses_total: number;
  signals_total: number;
  signals_urgentes: number;
  avg_confluence_pct: number;
  avg_latency_ms: number;
  last_analysis_at: string | null;
  watchlist_tickers: number;
  tokens_total: number;
  cost_usd_estimated: number;
}

const AGENTS: { id: string; label: string; model: string; accent: string }[] = [
  { id: 'A1', label: 'Activos · micro', model: 'sonnet-4-6', accent: 'text-a1' },
  { id: 'A2', label: 'Macro · global', model: 'sonnet-4-6', accent: 'text-a2' },
  { id: 'A3', label: 'Trading · price action', model: 'sonnet-4-6', accent: 'text-a3' },
  { id: 'A4', label: 'Sistema · ensamblado', model: 'opus-4-6', accent: 'text-a4' },
  { id: 'DEBATE', label: 'Debate · A1 × A2', model: 'opus-4-6', accent: 'text-a4' },
  { id: 'CMT', label: 'Scanner autónomo', model: 'haiku-4-5', accent: 'text-emerald' },
];

export default function SystemScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/system');
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/system');
          return;
        }
        return;
      }
      setStats(await r.json());
    } finally {
      setLoading(false);
    }
  }

  const lastAnalysis = stats?.last_analysis_at
    ? new Date(stats.last_analysis_at).toLocaleString()
    : '—';

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : 'ok'} />

      <section className="mx-4 mt-3 rounded-[18px] border border-a4/20 bg-gradient-to-br from-a4/[0.08] to-a1/[0.04] px-3.5 py-3.5">
        <div className="font-orbitron text-[22px] font-black tracking-[0.2em] bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
          A.D.A.M.
        </div>
        <div className="mt-1 font-mono text-[8px] text-slate tracking-wider">
          Anomaly Detection &amp; Analysis Module · ATLAS CAPITAL
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-blink-slow" />
          <span className="font-mono text-[9px] text-emerald">sistema operativo</span>
          <span className="ml-auto font-mono text-[9px] text-slate">v0.2.0 · sprint-2</span>
        </div>
      </section>

      <SectionLabel>métricas</SectionLabel>
      <div className="px-4 grid grid-cols-2 gap-2">
        <Stat n={stats?.analyses_total ?? 0} l="análisis ejecutados" />
        <Stat n={stats?.signals_total ?? 0} l="señales generadas" />
        <Stat n={stats?.signals_urgentes ?? 0} l="urgentes" cls="text-rose" />
        <Stat n={stats?.watchlist_tickers ?? 0} l="activos en watchlist" />
        <Stat n={`${stats?.avg_confluence_pct ?? 0}%`} l="confluencia media" cls="text-a3" />
        <Stat n={`${stats?.avg_latency_ms ?? 0}ms`} l="latencia media A4" />
        <Stat n={fmtTokens(stats?.tokens_total ?? 0)} l="tokens consumidos" cls="text-a2" />
        <Stat n={`$${(stats?.cost_usd_estimated ?? 0).toFixed(2)}`} l="coste estimado (USD)" cls="text-emerald" />
      </div>

      <SectionLabel>agentes</SectionLabel>
      <div className="px-4 space-y-1.5">
        {AGENTS.map((a) => (
          <div
            key={a.id}
            className="rounded-[15px] border border-white/5 bg-surface-2 px-3 py-2 flex items-center gap-3"
          >
            <span className={`font-orbitron text-[10px] font-bold tracking-wider ${a.accent} w-14`}>
              {a.id}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] text-white truncate">{a.label}</div>
              <div className="font-mono text-[8px] text-slate truncate">{a.model}</div>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-blink-slow" />
              <span className="font-mono text-[8px] text-emerald">ONLINE</span>
            </div>
          </div>
        ))}
      </div>

      <SectionLabel>actividad reciente</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-white/5 bg-surface-2 px-3 py-2">
        <KV k="último análisis" v={lastAnalysis} />
        <KV k="modelo principal" v="claude-opus-4-6 (A4 + debate)" />
        <KV k="data provider" v="Alpha Vantage · free tier 25/día" />
        <KV k="cache" v={process.env.NEXT_PUBLIC_UPSTASH_ENABLED ? 'Upstash activo' : 'sin caché (free tier vulnerable)'} />
      </div>

      <SectionLabel>seguridad</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-white/5 bg-surface-2 px-3 py-2">
        <KV k="A3 aislado" v="✓ 3 capas · 65 tests" cls="text-emerald" />
        <KV k="RLS Supabase" v="✓ 13 policies activas" cls="text-emerald" />
        <KV k="rate-limit" v="middleware presente · Upstash pendiente" cls="text-a3" />
        <KV k="disclaimer" v="presente en footer + A4 prompt" cls="text-emerald" />
      </div>

      <footer className="px-5 pt-6 text-center font-mono text-[8px] text-slate opacity-60 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Stat({ n, l, cls }: { n: number | string; l: string; cls?: string }) {
  return (
    <div className="rounded-[15px] border border-white/5 bg-surface-2 px-3 py-2.5">
      <div className={`font-orbitron text-[20px] font-black ${cls ?? 'text-white'}`}>{n}</div>
      <div className="mt-0.5 font-mono text-[8px] text-slate">{l}</div>
    </div>
  );
}

function KV({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-white/5 py-1 last:border-b-0">
      <span className="font-mono text-[9px] text-slate-l flex-shrink-0">{k}</span>
      <span className={`text-right font-mono text-[9px] ${cls ?? 'text-white'}`}>{v}</span>
    </div>
  );
}
