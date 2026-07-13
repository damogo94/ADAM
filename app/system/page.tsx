'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { ArchitectureDiagram } from '@/components/architecture-diagram';
import { UsersConsole } from '@/components/system/users-console';
import { cn } from '@/lib/utils';
import { DISCLAIMER_LITERAL } from '@/lib/disclaimer';

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
  // Ejes nuevos (Fase 1) — opcionales por back-compat con el endpoint viejo.
  by_actionable?: Record<string, CalibrationBucket>;
  by_kappa?: Record<string, CalibrationBucket>;
  // Opción C · track-record per-agente (medición; aún no repondera).
  by_agent?: Record<string, CalibrationBucket>;
}

const AGENTS: { id: string; label: string; model: string; mode?: 'narrate' | 'compute' }[] = [
  { id: 'A1', label: 'Activo · micro', model: 'haiku-4-5', mode: 'narrate' },
  { id: 'A2', label: 'Economía · macro', model: 'sonnet-4-6', mode: 'narrate' },
  { id: 'A3', label: 'Gráfico · price action', model: 'haiku-4-5 (narrate) + código (compute)', mode: 'compute' },
  { id: 'A4', label: 'Síntesis · ensamblado', model: 'haiku-4-5 (narrate) + código (confluence)', mode: 'compute' },
  { id: 'DEBATE', label: 'Debate · Activo × Economía', model: 'sonnet-4-6', mode: 'narrate' },
  { id: 'CMT', label: 'Scanner autónomo', model: 'código (computeTechnical · sin LLM)', mode: 'compute' },
  { id: 'EST', label: 'Estructura · price action MTF', model: 'haiku-4-5 (narrate) + código (compute)', mode: 'compute' },
];

// Mapa código (cost agent, UPPERCASE) → rol visible + clave de calibración.
const AGENT_ROLE: Record<string, string> = {
  A1: 'Activo', A2: 'Economía', A3: 'Gráfico', A4: 'Síntesis',
  DEBATE: 'Debate', ESTRUCTURA: 'Estructura', EST: 'Estructura', CMT: 'CMT',
};
const AGENT_CALKEY: Record<string, string> = {
  A1: 'a1', A2: 'a2', A3: 'a3', ESTRUCTURA: 'estructura', EST: 'estructura',
};

export default function SystemScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
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
        // No tragamos el fallo en silencio: sin esto la página pintaba ceros/"—"
        // como si fueran datos reales (el `?? 0` de cada Stat). Mostramos banner.
        setError(`No se pudieron cargar las métricas del sistema (HTTP ${statsRes.status}).`);
        return;
      }
      setStats(await statsRes.json());
      if (calRes.ok) setCalibration(await calRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con el sistema.');
    } finally {
      setLoading(false);
    }
  }

  const lastAnalysis = stats?.last_analysis_at
    ? new Date(stats.last_analysis_at).toLocaleString()
    : '—';
  const hasCal = !!calibration && calibration.total.n > 0;

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : 'ok'} />

      <section className="mx-4 mt-3 rounded-card-md border border-white/15 bg-surface-2 px-3.5 py-3.5">
        <div className="font-sans text-[22px] font-extrabold tracking-[0.2em] text-ink">
          A.D.A.M.
        </div>
        <div className="mt-1 font-mono text-[12px] text-ink/66 tracking-wider">
          Anomaly Detection &amp; Analysis Module · ATLAS CAPITAL
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink-slow" />
          <span className="font-mono text-[12px] text-ink">sistema operativo</span>
          <span className="ml-auto font-mono text-[12px] text-ink/66">v0.6.0 · pivote a señales reales (ADR-005)</span>
        </div>
        <div className="mt-1 font-mono text-[12px] text-ink/66 leading-snug">
          Pipeline determinístico: math en código (computeTechnical · computeConfluence) ·
          LLM solo para narrativa · 2 intentos máx en parse/schema errors
        </div>
      </section>

      <SectionLabel>métricas</SectionLabel>
      {error && !stats ? (
        <div
          role="alert"
          className="mx-4 rounded-card-sm border border-white/30 bg-white/[0.06] px-3 py-3 font-mono text-[12px] leading-snug text-ink/80"
        >
          <div className="mb-1 uppercase tracking-wider text-ink/60">métricas no disponibles</div>
          {error} No se muestran contadores para no presentar ceros como si fueran datos reales.{' '}
          <button
            onClick={() => void load()}
            className="underline underline-offset-2 transition-colors hover:text-ink"
          >
            reintentar
          </button>
        </div>
      ) : (
      <>
        {/* Retry fallido tras una carga previa OK: los datos son reales pero viejos.
            No viola "cero ceros falsos" (hay datos), pero el fallo no debe quedar mudo. */}
        {error && (
          <div
            role="alert"
            className="mx-4 mb-2 rounded-card-sm border border-white/20 bg-white/[0.05] px-3 py-2 font-mono text-[11px] leading-snug text-ink/75"
          >
            No se pudo actualizar — mostrando datos previos.{' '}
            <button onClick={() => void load()} className="underline underline-offset-2 hover:text-ink">
              reintentar
            </button>
          </div>
        )}
      <div className="px-4 grid grid-cols-2 gap-2">
        <Stat n={stats?.analyses_total ?? 0} l="análisis ejecutados" />
        <Stat n={stats?.signals_total ?? 0} l="señales generadas" />
        <Stat
          n={stats?.signals_urgentes ?? 0}
          l="urgentes"
          cls={(stats?.signals_urgentes ?? 0) > 0 ? 'text-accent' : 'text-ink/66'}
          emphasis={(stats?.signals_urgentes ?? 0) > 0}
        />
        <Stat n={stats?.watchlist_tickers ?? 0} l="activos en watchlist" />
        <Stat n={`${stats?.avg_confluence_pct ?? 0}%`} l="confluencia media" cls="text-ink" />
        <Stat n={`${stats?.avg_latency_ms ?? 0}ms`} l="latencia media · síntesis" />
        <Stat
          n={fmtTokens(stats?.tokens_total ?? 0)}
          l="tokens · últimos 100 runs"
          sub="acumulado del período"
        />
        <Stat
          n={`$${(stats?.cost_usd_estimated ?? 0).toFixed(2)}`}
          l="coste USD · últimos 100"
          cls="text-accent"
          sub="acumulado del período"
        />
      </div>
      </>
      )}

      <SectionLabel>usuarios</SectionLabel>
      <UsersConsole />

      <SectionLabel>por agente · coste + acierto</SectionLabel>
      <AgentCostBreakdown
        rows={stats?.by_agent ?? []}
        totalCost={stats?.cost_usd_estimated ?? 0}
        calByAgent={calibration?.by_agent}
      />

      <SectionLabel>calibración · backtesting modo B</SectionLabel>
      <div className="mx-4 rounded-card-sm border border-white/8 bg-surface-2 px-3 py-2.5">
        {!hasCal ? (
          <div className="font-mono text-[12px] text-ink/66 leading-snug">
            Sin outcomes evaluados aún. El cron diario (22:00 UTC) evalúa
            análisis con horizonte 7d/30d madurado. Threshold ajustado por
            volatilidad: max(±2%, 1·ATR%).
          </div>
        ) : (
          <>
            {/* Banner global con barra prominente. */}
            <div className="mb-2.5">
              <div className="mb-1 font-mono text-[12px] font-medium uppercase tracking-wider text-accent">
                hit-rate global · {calibration!.total.hit_rate_pct ?? '—'}% · N={calibration!.total.n}
              </div>
              <HitBar pct={calibration!.total.hit_rate_pct} tall />
            </div>

            {/* Barra en accent/blanco (NO emerald/rose): el acierto es métrica de
                desempeño, no dato de mercado direccional → respeta el firewall. */}
            <CalGroup title="horizonte">
              <CalRow label="7 días" bucket={calibration!.by_horizon['7']} />
              <CalRow label="30 días" bucket={calibration!.by_horizon['30']} />
            </CalGroup>
            <CalGroup title="dirección">
              <CalRow label="alcista" bucket={calibration!.by_direction.alcista} />
              <CalRow label="bajista" bucket={calibration!.by_direction.bajista} />
              <CalRow label="neutral" bucket={calibration!.by_direction.neutral} />
            </CalGroup>
            {/* Solo los valores reales del enum confidence_t (baja/media/alta) —
                'muy alta' era un bucket muerto que no existe en ningún output. */}
            <CalGroup title="confianza">
              <CalRow label="alta" bucket={calibration!.by_confidence.alta} />
              <CalRow label="media" bucket={calibration!.by_confidence.media} />
              <CalRow label="baja" bucket={calibration!.by_confidence.baja} />
            </CalGroup>
            <CalGroup title="confluencia">
              <CalRow label="61-100" bucket={calibration!.by_confluence['61-100']} />
              <CalRow label="31-60" bucket={calibration!.by_confluence['31-60']} />
              <CalRow label="0-30" bucket={calibration!.by_confluence['0-30']} />
            </CalGroup>
            {/* Eje rey (Fase 1): ¿sube el acierto con la fiabilidad? */}
            <CalGroup title="fiabilidad">
              <CalRow label="61-100" bucket={calibration!.by_actionable?.['61-100']} strong />
              <CalRow label="31-60" bucket={calibration!.by_actionable?.['31-60']} strong />
              <CalRow label="0-30" bucket={calibration!.by_actionable?.['0-30']} strong />
            </CalGroup>
            <CalGroup title="κ coincidencia">
              <CalRow label="alta" bucket={calibration!.by_kappa?.alta} />
              <CalRow label="media" bucket={calibration!.by_kappa?.media} />
              <CalRow label="baja" bucket={calibration!.by_kappa?.baja} />
            </CalGroup>
          </>
        )}
      </div>

      <SectionLabel>agentes</SectionLabel>
      <div className="px-4 space-y-1.5">
        {AGENTS.map((a) => (
          <div
            key={a.id}
            className="rounded-card-sm border border-white/8 bg-surface-2 px-3 py-2 flex items-center gap-3"
          >
            <span className="font-sans text-[12px] font-bold tracking-wider text-ink w-14">
              {a.id}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[12px] text-ink truncate">{a.label}</div>
              <div className="font-mono text-[12px] text-ink/66 truncate">{a.model}</div>
            </div>
            {a.mode === 'compute' && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent border border-accent/35 bg-accent/[0.05] rounded px-1.5 py-0.5">
                hybrid
              </span>
            )}
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink-slow" />
              <span className="font-mono text-[12px] text-ink/85 uppercase tracking-wider">ONLINE</span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Ficha técnica (config estática · plegada por defecto) ─────────── */}
      <div className="mx-4 mt-4 mb-1 flex items-center gap-2" aria-hidden>
        <span className="h-px flex-1 bg-white/8" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/35">ficha técnica</span>
        <span className="h-px flex-1 bg-white/8" />
      </div>

      <FoldSection title="pipeline determinístico">
        <div className="space-y-1.5">
          <div className="font-mono text-[12px] text-accent uppercase tracking-wider font-medium">
            refactor F1 — math fuera del LLM
          </div>
          <KV k="computeTechnical()" v="SMA · VWAP · ATR · RSI · MACD · trend · niveles · patrones · MTF · rango 52s · operativa" cls="text-ink/85" />
          <KV k="horizonte (F8b)" v="distancia-a-target en ATRs · estBars = K² random-walk → intradia/swing/posicional" cls="text-ink/85" />
          <KV k="computeConfluence()" v="30/40/30 (3 patas) · 30/25/20/25 con Estructura · capping por agentes vivos" cls="text-ink/85" />
          <KV k="ejes separados (Fase 1)" v="veredicto firmado net ±100 · κ coincidencia · fiabilidad = |net|·f(κ)" cls="text-ink/85" />
          <KV k="Estructura · 4ª pata" v="opt-in · re-narra Síntesis a 4 patas + persiste estructura_output (mig 0017)" cls="text-ink/85" />
          <KV k="cron a2-reconcile" v="11:00 UTC · pre-warm caché Economía + backfill Síntesis server-side" cls="text-ink/85" />
          <KV k="track-record · por agente" v="acierto direccional Activo/Economía/Gráfico/Estructura — medición, aún no repondera" cls="text-ink/85" />
          <KV k="evaluación de trades" v="dual-source A3 + Estructura · una fila por (analysis_id, source) (mig 0018)" cls="text-ink/85" />
          <KV k="entry_type (F8a)" v="market|limit propagado a CMT + backtest — límite sin fill no es trade (mig 0019)" cls="text-ink/85" />
          <KV k="validación (ADR-004/005)" v="backtest multi-régimen + costes + survivorship — hoy ninguna señal supera el gate" cls="text-ink/85" />
          <KV k="retry policy (F2.2)" v="2 intentos en parse/schema mismatch — JSON malformado se recupera" cls="text-ink/85" />
          <KV k="Economía edge case (F2.1)" v="snapshot vacío → confidence ≤ 20, NO inventa Fed funds" cls="text-ink/85" />
          <KV k="trace ID" v="UUID propagado a los agentes para correlación de logs" cls="text-ink/85" />
          <KV k="endpoint" v="/api/agents/run (pipeline integrado · streaming NDJSON)" cls="text-ink/85" />
          <KV k="osciladores Gráfico" v="RSI 14 + MACD 12/26/9 — confirmación, no driver" cls="text-ink/85" />
          <KV k="tests · CI" v="775 unitarios · GitHub Actions typecheck+lint+test" cls="text-accent" />
        </div>
      </FoldSection>

      <FoldSection title="arquitectura">
        <ArchitectureDiagram />
      </FoldSection>

      <FoldSection title="actividad reciente">
        <KV k="último análisis" v={lastAnalysis} />
        <KV k="modelos" v="Haiku 4.5 (narrate) · Sonnet 4.6 (Economía · Debate) · código (compute)" />
        <KV k="data provider" v="Yahoo /v8/chart · Finnhub 60/min · cripto: CMC ∥ CoinGecko → CoinStats + newsdata.io" />
        <KV k="cache" v="A2 + macro: Supabase · sparklines: Upstash 15min · prompt caching ephemeral 5min" />
        <KV k="timeout" v="25s/agente · maxDuration 60s · ~54s worst case" />
      </FoldSection>

      <FoldSection title="seguridad">
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-1.5">
          {SECURITY.map((s) => (
            <div
              key={s.k}
              className="flex items-start gap-1.5 rounded-md border border-accent/20 bg-accent/[0.04] px-2 py-1.5"
            >
              <span className="mt-px flex-shrink-0 font-mono text-[12px] leading-none text-accent">✓</span>
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-ink truncate">{s.k}</div>
                <div className="font-mono text-[10px] leading-snug text-ink/55">{s.v}</div>
              </div>
            </div>
          ))}
        </div>
      </FoldSection>

      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-ink/66 leading-relaxed">
        {DISCLAIMER_LITERAL}
      </footer>
    </div>
  );
}

const SECURITY: { k: string; v: string }[] = [
  { k: 'A3 aislado', v: '3 capas + compute sin LLM' },
  { k: 'Estructura aislado', v: 'guard propio · solo OHLCV (+vanilla)' },
  { k: '/system allowlist', v: 'system_access + RPC · default-deny · sin cache' },
  { k: 'RLS Supabase', v: '13 policies activas' },
  { k: 'rate-limit', v: '5/min · 30/día IP · 30/día user' },
  { k: 'CSRF', v: 'checkSameOrigin en POST/PATCH/DELETE' },
  // Debate y CMT validan en runtime contra su schema propio (no-strict) — no inflar el chip.
  { k: 'schemas Zod strict', v: 'A1·A2·A3·A4·Estructura (Debate·CMT no-strict)' },
  { k: 'type-safety', v: 'tipos Supabase generados · 0 casts as-any' },
  { k: 'disclaimer literal', v: 'A4Output + footer' },
];

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Sección plegable para la ficha técnica (config estática). Nativa <details>. */
function FoldSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group mx-4 mt-1.5 rounded-card-sm border border-white/8 bg-surface-2" open={defaultOpen}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/70 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="font-bold text-accent transition-transform group-open:rotate-90" aria-hidden>›</span>
        {title}
      </summary>
      <div className="border-t border-white/5 px-3 py-2.5">{children}</div>
    </details>
  );
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
        'rounded-card-sm border bg-surface-2 px-3 py-2.5 transition-all',
        emphasis ? 'border-white/30 bg-white/[0.06]' : 'border-white/8'
      )}
    >
      <div className={cn('font-mono text-[20px] font-black', cls ?? 'text-ink')}>{n}</div>
      <div className="mt-0.5 font-mono text-[12px] text-ink/66">{l}</div>
      {sub && <div className="mt-px font-mono text-[10px] text-ink/45 italic">{sub}</div>}
    </div>
  );
}

function KV({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-white/5 py-1 last:border-b-0">
      <span className="font-mono text-[12px] text-ink/66 flex-shrink-0">{k}</span>
      <span className={cn('text-right font-mono text-[12px]', cls ?? 'text-ink')}>{v}</span>
    </div>
  );
}

/** Barra de hit-rate. Accent/blanco — NUNCA emerald/rose (firewall: el acierto
 *  es desempeño, no dirección de mercado). Vacía cuando no hay dato (pct null). */
function HitBar({ pct, tall }: { pct: number | null; tall?: boolean }) {
  return (
    <span className={cn('relative block w-full overflow-hidden rounded-full bg-white/8', tall ? 'h-2' : 'h-1.5')}>
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-accent/80 transition-[width] duration-500"
        style={{ width: `${pct ?? 0}%` }}
      />
    </span>
  );
}

/** Fila de calibración: label + barra de hit-rate + % + n. */
function CalRow({ label, bucket, strong }: { label: string; bucket?: CalibrationBucket; strong?: boolean }) {
  const pct = bucket?.hit_rate_pct ?? null;
  const n = bucket?.n ?? 0;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={cn('w-[72px] flex-shrink-0 font-mono text-[11px]', strong ? 'text-ink' : 'text-ink/66')}>
        {label}
      </span>
      <span className="min-w-0 flex-1">
        <HitBar pct={pct} />
      </span>
      <span className="w-[40px] flex-shrink-0 text-right font-mono text-[11px] tabular-nums text-ink/85">
        {pct === null ? '—' : `${pct}%`}
      </span>
      <span className="w-[36px] flex-shrink-0 text-right font-mono text-[10px] tabular-nums text-ink/45">
        n={n}
      </span>
    </div>
  );
}

function CalGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5 first:mt-0">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/40">{title}</div>
      {children}
    </div>
  );
}

function shortModel(m: string): string {
  // claude-sonnet-4-6 → sonnet-4-6 · claude-haiku-4-5-20251001 → haiku-4-5
  return m.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

/**
 * Tabla unificada POR AGENTE: une coste (stats.by_agent, clave UPPERCASE) con
 * acierto direccional (calibration.by_agent, clave lowercase a1/a2/a3/estructura).
 * Conducida por las filas de coste (todo run las puebla); el acierto se adjunta
 * cuando existe (A4/Debate/CMT no tienen track-record direccional → sin %).
 */
function AgentCostBreakdown({
  rows,
  totalCost,
  calByAgent,
}: {
  rows: AgentAggregate[];
  totalCost: number;
  calByAgent?: Record<string, CalibrationBucket>;
}) {
  if (rows.length === 0) {
    return (
      <div className="mx-4 rounded-card-sm border border-white/8 bg-surface-2 px-3 py-2.5">
        <div className="font-mono text-[12px] text-ink/66 leading-snug">
          Sin runs con desglose por agente todavía. Cualquier análisis nuevo
          aparecerá aquí — la columna usage_breakdown (migración 0005) se
          puebla automáticamente desde /api/agents/run.
        </div>
      </div>
    );
  }
  return (
    <div className="mx-4 rounded-card-sm border border-white/8 bg-surface-2 px-3 py-2.5 space-y-1.5">
      {rows.map((r) => {
        const code = r.agent.toUpperCase();
        const role = AGENT_ROLE[code] ?? r.agent;
        const calKey = AGENT_CALKEY[code];
        const cal = calKey ? calByAgent?.[calKey] : undefined;
        const hit = cal && cal.n > 0 ? cal.hit_rate_pct : null;
        const share = totalCost > 0 ? Math.round((r.cost_usd / totalCost) * 100) : 0;
        return (
          <div
            key={r.agent}
            className="flex items-center gap-3 border-b border-white/5 py-1.5 last:border-b-0"
          >
            <span className="w-12 flex-shrink-0 font-sans text-[11px] font-bold tracking-wider text-ink">
              {code}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[12px] text-ink">{role}</span>
                {hit !== null && (
                  <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-ink/60">
                    · {hit}% acierto
                  </span>
                )}
              </div>
              <div className="truncate font-mono text-[11px] text-ink/66">
                ${r.cost_usd.toFixed(4)} · {share}% · {r.models.map(shortModel).join(' · ')} · {r.runs} runs · cache {r.cache_hit_rate_pct}%
              </div>
            </div>
            <div className="flex-shrink-0 font-mono text-[11px] tabular-nums text-ink/66">
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
