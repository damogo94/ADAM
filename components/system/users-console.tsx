'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { DirectionBadge, ConfidenceChip } from '@/components/agent-primitives';

/**
 * Consola master-detail de usuarios para /system (solo allowlist; el gate real
 * vive en servidor: layout + APIs). Tres niveles:
 *   L0 listado de usuarios → L1 actividad del usuario → L2 detalle de un run.
 * Sólo presentación: fetch a /api/system/{users,users/[id],analyses/[id]}.
 */

// ── Formas de las 3 respuestas nuevas ────────────────────────────────────────
interface UsersOverviewRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  registered_at: string;
  analyses_count: number;
  distinct_tickers: number;
  last_analysis_at: string | null;
  signals_count: number;
}
interface ByTicker {
  ticker: string;
  analyses_count: number;
  last_analysis_at: string;
  avg_confluence_pct: number | null;
  last_direction: string;
  last_confidence: string;
}
interface RecentRun {
  id: string;
  ticker: string;
  created_at: string;
  confluence_pct: number;
  direction: string;
  confidence: string;
  latency_ms: number | null;
  tokens_used: number | null;
}
interface UserActivity {
  totals: {
    analyses_count: number;
    distinct_tickers: number;
    signals_count: number;
    last_analysis_at: string | null;
    avg_confluence_pct: number | null;
  };
  by_ticker: ByTicker[];
  recent: RecentRun[];
}
interface AnalysisDetail {
  id: string;
  user_id: string;
  ticker: string;
  confluence_pct: number;
  direction: string;
  confidence: string;
  a1_output: unknown;
  a2_output: unknown;
  a3_output: unknown;
  debate_output: unknown;
  a4_output: unknown;
  latency_ms: number | null;
  tokens_used: number | null;
  usage_breakdown: unknown;
  created_at: string;
}

type Dir = string;

export function UsersConsole() {
  const [users, setUsers] = useState<UsersOverviewRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/system/users');
      if (!r.ok) {
        setError(r.status === 403 ? 'sin permiso para esta vista' : `error ${r.status}`);
        return;
      }
      const j = (await r.json()) as { users: UsersOverviewRow[] };
      setUsers(j.users ?? []);
    } catch {
      setError('error de red');
    } finally {
      setLoading(false);
    }
  }

  async function selectUser(id: string) {
    if (selectedId === id) {
      setSelectedId(null);
      setActivity(null);
      return;
    }
    setSelectedId(id);
    setActivity(null);
    setExpandedRun(null);
    setDetail(null);
    setActivityLoading(true);
    try {
      const r = await fetch(`/api/system/users/${id}`);
      if (r.ok) {
        const j = (await r.json()) as { activity: UserActivity | null };
        setActivity(j.activity ?? null);
      }
    } catch {
      /* dejamos activity null → la UI muestra "sin datos" */
    } finally {
      setActivityLoading(false);
    }
  }

  async function toggleRun(runId: string) {
    if (expandedRun === runId) {
      setExpandedRun(null);
      setDetail(null);
      return;
    }
    setExpandedRun(runId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/system/analyses/${runId}`);
      if (r.ok) {
        const j = (await r.json()) as { analysis: AnalysisDetail | null };
        setDetail(j.analysis ?? null);
      }
    } catch {
      /* detail null → "no disponible" */
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) {
    return <Box><span className="font-mono text-[10px] text-slate">cargando usuarios…</span></Box>;
  }
  if (error) {
    return <Box><span className="font-mono text-[10px] text-rose">{error}</span></Box>;
  }
  if (!users || users.length === 0) {
    return <Box><span className="font-mono text-[10px] text-slate">sin usuarios</span></Box>;
  }

  return (
    <div className="mx-4 space-y-1.5">
      {users.map((u) => {
        const open = selectedId === u.user_id;
        return (
          <div
            key={u.user_id}
            className={cn(
              'rounded-[15px] border bg-surface-2 transition-colors',
              open ? 'border-white/25' : 'border-white/8 hover:border-white/20'
            )}
          >
            {/* L0 · fila de usuario */}
            <button
              onClick={() => selectUser(u.user_id)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] font-medium text-white truncate">
                  {u.email ?? <span className="text-white/35">sin email</span>}
                </div>
                <div className="font-mono text-[8px] text-white/45 truncate">
                  {u.display_name ?? '—'} · alta {fmtDate(u.registered_at)}
                </div>
              </div>
              <Metric n={u.analyses_count} l="análisis" />
              <Metric n={u.signals_count} l="señales" />
              <div className="w-14 text-right">
                <div className="font-mono text-[9px] text-white/70">{u.last_analysis_at ? timeAgo(u.last_analysis_at) : '—'}</div>
                <div className="font-mono text-[7px] uppercase tracking-wider text-white/35">último</div>
              </div>
              <span className={cn('font-mono text-[11px] text-white/40 transition-transform', open && 'rotate-90')} aria-hidden>›</span>
            </button>

            {/* L1 · actividad del usuario */}
            {open && (
              <div className="border-t border-white/8 px-3 py-2.5">
                {activityLoading ? (
                  <span className="font-mono text-[10px] text-slate">cargando actividad…</span>
                ) : !activity ? (
                  <span className="font-mono text-[10px] text-slate">sin actividad</span>
                ) : (
                  <UserActivityPanel
                    activity={activity}
                    expandedRun={expandedRun}
                    detail={detail}
                    detailLoading={detailLoading}
                    onToggleRun={toggleRun}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UserActivityPanel({
  activity,
  expandedRun,
  detail,
  detailLoading,
  onToggleRun,
}: {
  activity: UserActivity;
  expandedRun: string | null;
  detail: AnalysisDetail | null;
  detailLoading: boolean;
  onToggleRun: (id: string) => void;
}) {
  const { totals, by_ticker, recent } = activity;
  return (
    <div className="space-y-2.5">
      {/* Totales */}
      <div className="grid grid-cols-4 gap-1.5">
        <Metric n={totals.analyses_count} l="análisis" boxed />
        <Metric n={totals.distinct_tickers} l="tickers" boxed />
        <Metric n={totals.signals_count} l="señales" boxed />
        <Metric n={totals.avg_confluence_pct === null ? '—' : `${totals.avg_confluence_pct}%`} l="conf. media" boxed />
      </div>

      {/* Por ticker */}
      {by_ticker.length > 0 && (
        <div>
          <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-white/40">por ticker</div>
          <div className="space-y-1">
            {by_ticker.map((t) => (
              <div key={t.ticker} className="flex items-center gap-2 rounded-md border border-white/5 bg-black/30 px-2 py-1">
                <span className="font-orbitron text-[10px] font-bold text-white w-16 flex-shrink-0">{t.ticker}</span>
                <DirectionBadge dir={t.last_direction as Dir} />
                <ConfidenceChip value={normConf(t.last_confidence)} />
                <span className="font-mono text-[9px] text-white/45">{t.analyses_count}× · {t.avg_confluence_pct ?? '—'}%</span>
                <span className="ml-auto font-mono text-[8px] text-white/40">{timeAgo(t.last_analysis_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runs recientes → L2 */}
      {recent.length > 0 && (
        <div>
          <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-white/40">runs recientes</div>
          <div className="space-y-1">
            {recent.map((r) => {
              const open = expandedRun === r.id;
              return (
                <div key={r.id} className="rounded-md border border-white/5 bg-black/30">
                  <button onClick={() => onToggleRun(r.id)} aria-expanded={open} className="flex w-full items-center gap-2 px-2 py-1 text-left">
                    <span className="font-orbitron text-[10px] font-bold text-white w-16 flex-shrink-0">{r.ticker}</span>
                    <DirectionBadge dir={r.direction} />
                    <ConfidenceChip value={normConf(r.confidence)} />
                    <span className="font-mono text-[9px] text-white/45">{r.confluence_pct}%</span>
                    <span className="ml-auto font-mono text-[8px] text-white/40">{fmtDateTime(r.created_at)}</span>
                    <span className={cn('font-mono text-[10px] text-white/40 transition-transform', open && 'rotate-90')} aria-hidden>›</span>
                  </button>
                  {open && (
                    <div className="border-t border-white/5 px-2 py-2">
                      {detailLoading ? (
                        <span className="font-mono text-[9px] text-slate">cargando detalle…</span>
                      ) : !detail ? (
                        <span className="font-mono text-[9px] text-slate">detalle no disponible</span>
                      ) : (
                        <AnalysisDetailView detail={detail} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisDetailView({ detail }: { detail: AnalysisDetail }) {
  return (
    <div className="space-y-2">
      {/* Veredicto A4 + métricas del run */}
      <div className="flex flex-wrap items-center gap-2">
        <DirectionBadge dir={detail.direction} />
        <ConfidenceChip value={normConf(detail.confidence)} />
        <span className="font-mono text-[9px] text-white/55">confluencia {detail.confluence_pct}%</span>
        <span className="font-mono text-[8px] text-white/35">· {detail.latency_ms ?? '—'}ms · {detail.tokens_used ?? '—'} tok</span>
      </div>

      {/* Outputs por agente (jsonb crudo, scrollable) */}
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        <JsonBlock label="A1" value={detail.a1_output} />
        <JsonBlock label="A2" value={detail.a2_output} />
        <JsonBlock label="A3 (aislado)" value={detail.a3_output} />
        <JsonBlock label="Debate" value={detail.debate_output} />
        <JsonBlock label="A4" value={detail.a4_output} />
        <JsonBlock label="usage_breakdown" value={detail.usage_breakdown} />
      </div>
    </div>
  );
}

// ── átomos ───────────────────────────────────────────────────────────────────
function Box({ children }: { children: React.ReactNode }) {
  return <div className="mx-4 rounded-[15px] border border-white/8 bg-surface-2 px-3 py-4 text-center">{children}</div>;
}

function Metric({ n, l, boxed }: { n: number | string; l: string; boxed?: boolean }) {
  return (
    <div className={cn('text-center', boxed && 'rounded-md border border-white/8 bg-black/30 px-2 py-1.5')}>
      <div className="font-orbitron text-[13px] font-bold text-white tabular-nums">{n}</div>
      <div className="font-mono text-[7px] uppercase tracking-wider text-white/40">{l}</div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const empty = value === null || value === undefined;
  return (
    <div className="rounded-md border border-white/8 bg-black/40">
      <div className="border-b border-white/5 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-white/50">{label}</div>
      <pre className="max-h-44 overflow-auto px-2 py-1 font-mono text-[8px] leading-snug text-white/70 whitespace-pre-wrap break-words">
        {empty ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
/** Normaliza la confianza (enum confidence_t) a la categoría del ConfidenceChip. */
function normConf(c: string): 'alta' | 'media' | 'baja' {
  return c === 'alta' || c === 'media' || c === 'baja' ? c : 'baja';
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString().replace(',', '');
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
