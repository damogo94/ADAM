'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { ArchitectureDiagram } from '@/components/architecture-diagram';
import { cn } from '@/lib/utils';

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

const AGENTS: { id: string; label: string; model: string }[] = [
  { id: 'A1', label: 'Activos · micro', model: 'sonnet-4-6' },
  { id: 'A2', label: 'Macro · global', model: 'sonnet-4-6' },
  { id: 'A3', label: 'Trading · price action', model: 'sonnet-4-6' },
  { id: 'A4', label: 'Sistema · ensamblado', model: 'opus-4-6' },
  { id: 'DEBATE', label: 'Debate · A1 × A2', model: 'opus-4-6' },
  { id: 'CMT', label: 'Scanner autónomo', model: 'haiku-4-5' },
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

      <section className="mx-4 mt-3 rounded-[18px] border border-white/15 bg-surface-2 px-3.5 py-3.5">
        <div className="font-orbitron text-[22px] font-black tracking-[0.2em] text-white">
          A.D.A.M.
        </div>
        <div className="mt-1 font-mono text-[8px] text-white/40 tracking-wider">
          Anomaly Detection &amp; Analysis Module · ATLAS CAPITAL
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink-slow" />
          <span className="font-mono text-[9px] text-white">sistema operativo</span>
          <span className="ml-auto font-mono text-[9px] text-white/40">v0.3.0 · sprint-3</span>
        </div>
      </section>

      <SectionLabel>métricas</SectionLabel>
      <div className="px-4 grid grid-cols-2 gap-2">
        <Stat n={stats?.analyses_total ?? 0} l="análisis ejecutados" />
        <Stat n={stats?.signals_total ?? 0} l="señales generadas" />
        <Stat
          n={stats?.signals_urgentes ?? 0}
          l="urgentes"
          cls={(stats?.signals_urgentes ?? 0) > 0 ? 'text-rose' : 'text-white/40'}
          emphasis={(stats?.signals_urgentes ?? 0) > 0}
        />
        <Stat n={stats?.watchlist_tickers ?? 0} l="activos en watchlist" />
        <Stat n={`${stats?.avg_confluence_pct ?? 0}%`} l="confluencia media" cls="text-amber" />
        <Stat n={`${stats?.avg_latency_ms ?? 0}ms`} l="latencia media A4" />
        <Stat n={fmtTokens(stats?.tokens_total ?? 0)} l="tokens consumidos" />
        <Stat n={`$${(stats?.cost_usd_estimated ?? 0).toFixed(2)}`} l="coste estimado (USD)" cls="text-emerald" />
      </div>

      <SectionLabel>agentes</SectionLabel>
      <div className="px-4 space-y-1.5">
        {AGENTS.map((a) => (
          <div
            key={a.id}
            className="rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2 flex items-center gap-3"
          >
            <span className="font-orbitron text-[10px] font-bold tracking-wider text-white w-14">
              {a.id}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] text-white truncate">{a.label}</div>
              <div className="font-mono text-[8px] text-white/45 truncate">{a.model}</div>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink-slow" />
              <span className="font-mono text-[8px] text-white/85 uppercase tracking-wider">ONLINE</span>
            </div>
          </div>
        ))}
      </div>

      <SectionLabel>arquitectura</SectionLabel>
      <div className="px-4">
        <ArchitectureDiagram />
      </div>

      <SectionLabel>actividad reciente</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-white/5 bg-surface-2 px-3 py-2">
        <KV k="último análisis" v={lastAnalysis} />
        <KV k="modelo principal" v="claude-sonnet-4-6 (todos los agentes)" />
        <KV k="data provider" v="Finnhub 60/min + Yahoo /v8/chart" />
        <KV k="cache" v="Upstash L1+L2" />
      </div>

      <SectionLabel>seguridad</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2">
        <KV k="A3 aislado" v="✓ 3 capas · 65 tests" cls="text-emerald" />
        <KV k="RLS Supabase" v="✓ 13 policies activas" cls="text-emerald" />
        <KV k="rate-limit" v="✓ Upstash dual-layer" cls="text-emerald" />
        <KV k="disclaimer" v="✓ footer + A4 prompt" cls="text-emerald" />
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

function Stat({ n, l, cls, emphasis }: { n: number | string; l: string; cls?: string; emphasis?: boolean }) {
  // `emphasis` para stats que se vuelven prominentes cuando son > 0
  // (ej. urgentes con valor positivo). Antes se conseguía con text-rose;
  // ahora con border+bg más intensos manteniendo la familia B&W.
  return (
    <div
      className={cn(
        'rounded-[15px] border bg-surface-2 px-3 py-2.5 transition-all',
        emphasis ? 'border-rose/35 bg-rose/[0.06] animate-urg-pulse' : 'border-white/8'
      )}
    >
      <div className={cn('font-orbitron text-[20px] font-black', cls ?? 'text-white')}>{n}</div>
      <div className="mt-0.5 font-mono text-[8px] text-white/50">{l}</div>
    </div>
  );
}

function KV({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-white/5 py-1 last:border-b-0">
      <span className="font-mono text-[9px] text-white/55 flex-shrink-0">{k}</span>
      <span className={cn('text-right font-mono text-[9px]', cls ?? 'text-white')}>{v}</span>
    </div>
  );
}
