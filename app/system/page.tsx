'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { ArchitectureDiagram } from '@/components/architecture-diagram';
import { UsersConsole } from '@/components/system/users-console';
import { cn } from '@/lib/utils';

interface AgentAggregate {
  agent: string;
  runs: number;
  models: string[];
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cache_hit_rate_pct: number;
}

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
  by_agent: AgentAggregate[];
}

interface CalibrationBucket {
  n: number;
  hits: number;
  hit_rate_pct: number | null;
}
interface Calibration {
  total: CalibrationBucket;
  by_horizon: Record<string, CalibrationBucket>;
  by_direction: Record<string, CalibrationBucket>;
  by_confidence: Record<string, CalibrationBucket>;
  by_confluence: Record<string, CalibrationBucket>;
}

const AGENTS: { id: string; label: string; model: string; mode?: 'narrate' | 'compute' }[] = [
  { id: 'A1', label: 'Activos · micro', model: 'haiku-4-5', mode: 'narrate' },
  { id: 'A2', label: 'Macro · global', model: 'sonnet-4-6', mode: 'narrate' },
  { id: 'A3', label: 'Trading · price action', model: 'haiku-4-5 (narrate) + código (compute)', mode: 'compute' },
  { id: 'A4', label: 'Sistema · ensamblado', model: 'haiku-4-5 (narrate) + código (confluence)', mode: 'compute' },
  { id: 'DEBATE', label: 'Debate · A1 × A2', model: 'sonnet-4-6', mode: 'narrate' },
  { id: 'CMT', label: 'Scanner autónomo', model: 'código (computeTechnical · sin LLM)', mode: 'compute' },
];

export default function SystemScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [statsRes, calRes] = await Promise.all([
        fetch('/api/system'),
        fetch('/api/metrics/calibration'),
      ]);
      if (!statsRes.ok) {
        if (statsRes.status === 401) {
          router.push('/login?next=/system');
          return;
        }
        return;
      }
      setStats(await statsRes.json());
      if (calRes.ok) setCalibration(await calRes.json());
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
          <span className="ml-auto font-mono text-[9px] text-white/40">v0.4.0 · refactor F1+F2.2</span>
        </div>
        <div className="mt-1 font-mono text-[8px] text-white/45 leading-snug">
          Pipeline determinístico: math en código (computeTechnical · computeConfluence) ·
          LLM solo para narrativa · retry 2× en parse/schema errors
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
        <Stat
          n={fmtTokens(stats?.tokens_total ?? 0)}
          l="tokens · últimos 100 runs"
          sub="acumulado del período"
        />
        <Stat
          n={`$${(stats?.cost_usd_estimated ?? 0).toFixed(2)}`}
          l="coste USD · últimos 100"
          cls="text-emerald"
          sub="acumulado del período"
        />
      </div>

      <SectionLabel>usuarios</SectionLabel>
      <UsersConsole />

      <SectionLabel>coste por agente · últimos 100 runs</SectionLabel>
      <AgentCostBreakdown
        rows={stats?.by_agent ?? []}
        totalCost={stats?.cost_usd_estimated ?? 0}
      />

      <SectionLabel>calibración · backtesting modo B</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2.5">
        {!calibration || calibration.total.n === 0 ? (
          <div className="font-mono text-[9px] text-white/45 leading-snug">
            Sin outcomes evaluados aún. El cron diario (22:00 UTC) evalúa
            análisis con horizonte 7d/30d madurado. Threshold v1: ±2%.
          </div>
        ) : (
          <>
            <div className="font-mono text-[9px] text-emerald uppercase tracking-wider font-medium mb-1.5">
              hit-rate global: {calibration.total.hit_rate_pct}% · N={calibration.total.n}
            </div>
            <KV
              k="horizonte 7d"
              v={`${calibration.by_horizon['7']?.hit_rate_pct ?? '—'}% · n=${calibration.by_horizon['7']?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="horizonte 30d"
              v={`${calibration.by_horizon['30']?.hit_rate_pct ?? '—'}% · n=${calibration.by_horizon['30']?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="dirección alcista"
              v={`${calibration.by_direction.alcista?.hit_rate_pct ?? '—'}% · n=${calibration.by_direction.alcista?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="dirección bajista"
              v={`${calibration.by_direction.bajista?.hit_rate_pct ?? '—'}% · n=${calibration.by_direction.bajista?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="dirección neutral"
              v={`${calibration.by_direction.neutral?.hit_rate_pct ?? '—'}% · n=${calibration.by_direction.neutral?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="confianza muy_alta"
              v={`${calibration.by_confidence.muy_alta?.hit_rate_pct ?? '—'}% · n=${calibration.by_confidence.muy_alta?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="confianza alta"
              v={`${calibration.by_confidence.alta?.hit_rate_pct ?? '—'}% · n=${calibration.by_confidence.alta?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="confianza media"
              v={`${calibration.by_confidence.media?.hit_rate_pct ?? '—'}% · n=${calibration.by_confidence.media?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="confianza baja"
              v={`${calibration.by_confidence.baja?.hit_rate_pct ?? '—'}% · n=${calibration.by_confidence.baja?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="confluence 61-100"
              v={`${calibration.by_confluence['61-100']?.hit_rate_pct ?? '—'}% · n=${calibration.by_confluence['61-100']?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="confluence 31-60"
              v={`${calibration.by_confluence['31-60']?.hit_rate_pct ?? '—'}% · n=${calibration.by_confluence['31-60']?.n ?? 0}`}
              cls="text-white/85"
            />
            <KV
              k="confluence 0-30"
              v={`${calibration.by_confluence['0-30']?.hit_rate_pct ?? '—'}% · n=${calibration.by_confluence['0-30']?.n ?? 0}`}
              cls="text-white/85"
            />
          </>
        )}
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
            {a.mode === 'compute' && (
              <span className="font-mono text-[7px] uppercase tracking-wider text-emerald border border-emerald/35 bg-emerald/[0.05] rounded px-1.5 py-0.5">
                hybrid
              </span>
            )}
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink-slow" />
              <span className="font-mono text-[8px] text-white/85 uppercase tracking-wider">ONLINE</span>
            </div>
          </div>
        ))}
      </div>

      <SectionLabel>pipeline determinístico</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-emerald/20 bg-emerald/[0.03] px-3 py-2.5 space-y-1.5">
        <div className="font-mono text-[9px] text-emerald uppercase tracking-wider font-medium">
          refactor F1 — math fuera del LLM
        </div>
        <KV k="computeTechnical()" v="SMA · EMA · VWAP · ATR · RSI · MACD · trend · niveles · patrones · operativa" cls="text-white/85" />
        <KV k="computeConfluence()" v="scoring 30/40/30 · capping por agentes vivos · niveles deterministas" cls="text-white/85" />
        <KV k="retry policy (F2.2)" v="2 intentos en parse/schema mismatch — JSON malformado se recupera" cls="text-white/85" />
        <KV k="A2 edge case (F2.1)" v="snapshot vacío → confidence ≤ 20, NO inventa Fed funds" cls="text-white/85" />
        <KV k="trace ID" v="UUID propagado a los 4 agentes para correlación de logs" cls="text-white/85" />
        <KV k="endpoint" v="/api/agents/run (pipeline integrado)" cls="text-white/85" />
        <KV k="osciladores A3" v="RSI 14 + MACD 12/26/9 — confirmación, no driver" cls="text-white/85" />
        <KV k="tests · CI" v="464 unitarios · GitHub Actions typecheck+lint+test" cls="text-emerald" />
      </div>

      <SectionLabel>arquitectura</SectionLabel>
      <div className="px-4">
        <ArchitectureDiagram />
      </div>

      <SectionLabel>actividad reciente</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-white/5 bg-surface-2 px-3 py-2">
        <KV k="último análisis" v={lastAnalysis} />
        <KV k="modelos" v="Haiku 4.5 (narrate) · Sonnet 4.6 (A2 · Debate) · código (compute)" />
        <KV k="data provider" v="Finnhub 60/min + Yahoo /v8/chart" />
        <KV k="cache" v="Upstash L1+L2 + prompt caching ephemeral 5min" />
        <KV k="timeout" v="25s/agente · maxDuration 60s · ~50s worst case" />
      </div>

      <SectionLabel>seguridad</SectionLabel>
      <div className="mx-4 rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2">
        <KV k="A3 aislado" v="✓ 3 capas + compute sin LLM" cls="text-emerald" />
        <KV k="RLS Supabase" v="✓ 13 policies activas" cls="text-emerald" />
        <KV k="rate-limit" v="✓ 5/min/IP + 30/día/IP + 30/día/user" cls="text-emerald" />
        <KV k="CSRF" v="✓ checkSameOrigin en POST" cls="text-emerald" />
        <KV k="schemas Zod strict" v="✓ A1·A2·A3·A4·Debate·CMT (shared/types)" cls="text-emerald" />
        <KV k="type-safety" v="✓ tipos Supabase generados · 0 casts as-any en src" cls="text-emerald" />
        <KV k="disclaimer literal" v="✓ A4Output + footer" cls="text-emerald" />
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

function Stat({
  n,
  l,
  cls,
  emphasis,
  sub,
}: {
  n: number | string;
  l: string;
  cls?: string;
  emphasis?: boolean;
  /** Línea opcional debajo del label para aclarar el alcance del dato
   *  (ej. "acumulado del período", "última consulta", etc.) */
  sub?: string;
}) {
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
      {sub && <div className="mt-px font-mono text-[7px] text-white/30 italic">{sub}</div>}
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

function shortModel(m: string): string {
  // claude-sonnet-4-6 → sonnet-4-6 · claude-haiku-4-5-20251001 → haiku-4-5
  return m.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

function AgentCostBreakdown({
  rows,
  totalCost,
}: {
  rows: AgentAggregate[];
  totalCost: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="mx-4 rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2.5">
        <div className="font-mono text-[9px] text-white/45 leading-snug">
          Sin runs con desglose por agente todavía. Cualquier análisis nuevo
          aparecerá aquí — la columna usage_breakdown (migración 0005) se
          puebla automáticamente desde /api/agents/run.
        </div>
      </div>
    );
  }
  return (
    <div className="mx-4 rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2.5 space-y-1.5">
      {rows.map((r) => {
        const share = totalCost > 0 ? Math.round((r.cost_usd / totalCost) * 100) : 0;
        return (
          <div
            key={r.agent}
            className="flex items-center gap-3 border-b border-white/5 py-1.5 last:border-b-0"
          >
            <span className="font-orbitron text-[11px] font-bold tracking-wider text-white w-14 flex-shrink-0">
              {r.agent}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[9px] text-white/85 truncate">
                ${r.cost_usd.toFixed(4)} · {share}% del total
              </div>
              <div className="font-mono text-[8px] text-white/50 truncate">
                {r.models.map(shortModel).join(' · ')} · {r.runs} runs · cache {r.cache_hit_rate_pct}%
              </div>
            </div>
            <div className="font-mono text-[9px] text-white/55 flex-shrink-0 tabular-nums">
              {fmtTokens(r.total_tokens)} tok
            </div>
            <div className="h-8 w-12 flex items-end gap-0.5 flex-shrink-0" aria-hidden>
              <Bar pct={pctOf(r.input_tokens, r.total_tokens)} hint="input" />
              <Bar pct={pctOf(r.output_tokens, r.total_tokens)} hint="output" />
              <Bar pct={pctOf(r.cache_read_input_tokens, r.total_tokens)} hint="cache" muted />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function pctOf(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(2, Math.round((n / total) * 100)); // mín 2% para que se vea la barra
}

function Bar({ pct, hint, muted }: { pct: number; hint: string; muted?: boolean }) {
  return (
    <div
      className={cn('w-2 rounded-sm', muted ? 'bg-white/25' : 'bg-white/85')}
      style={{ height: `${Math.min(100, pct)}%` }}
      title={`${hint}: ${pct}%`}
    />
  );
}
