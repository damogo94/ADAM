'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { cn, getCurrencyFromTicker } from '@/lib/utils';
import type { SignalHistory, SignalLevel, WatchlistItem, SignalTradeOutcome } from '@/types/db';

/** Señal + outcome de trade (null = en seguimiento / no seguida). */
type SignalWithOutcome = SignalHistory & { outcome: SignalTradeOutcome | null };

interface Stats {
  urgente: number;
  atencion: number;
  monitorear: number;
}

const MAX_SELECTABLE = 5;

type LevelFilter = 'all' | SignalLevel;
type AckFilter = 'all' | 'unread' | 'acknowledged';

// ── Clasificación de seguimiento ─────────────────────────────────────────────
// Resuelta = el cron evaluó el trade a una barrera (win/loss/timeout) o la orden
// no entró (no_fill). En seguimiento = 1D con niveles, aún sin resolver. No
// seguida = intradía, sin niveles, o no evaluable (geometría degenerada).
type TrackStatus = 'resolved' | 'tracking' | 'unfollowed';
const RESOLVED_OUTCOMES = new Set(['win', 'loss', 'timeout', 'no_fill']);

function trackStatus(s: SignalWithOutcome): TrackStatus {
  const o = s.outcome?.outcome;
  if (o && RESOLVED_OUTCOMES.has(o)) return 'resolved';
  const trackable =
    s.timeframe === '1D' && s.entry_price != null && s.stop_loss != null && s.target_price != null;
  if (!s.outcome && trackable) return 'tracking';
  return 'unfollowed'; // not_evaluable, 1H intradía, o sin niveles
}

interface TrackRecord {
  win: number;
  loss: number;
  timeout: number;
  noFill: number;
  denom: number; // win+loss+timeout (base del hit-rate; no_fill no entra)
  hitRate: number | null;
  avgR: number | null;
}

function computeTrackRecord(signals: SignalWithOutcome[]): TrackRecord {
  let win = 0;
  let loss = 0;
  let timeout = 0;
  let noFill = 0;
  const rs: number[] = [];
  for (const s of signals) {
    const o = s.outcome?.outcome;
    if (o === 'win') win++;
    else if (o === 'loss') loss++;
    else if (o === 'timeout') timeout++;
    else if (o === 'no_fill') noFill++;
    if ((o === 'win' || o === 'loss' || o === 'timeout') && s.outcome?.r_multiple != null) {
      rs.push(s.outcome.r_multiple);
    }
  }
  const denom = win + loss + timeout;
  return {
    win,
    loss,
    timeout,
    noFill,
    denom,
    hitRate: denom > 0 ? Math.round((win / denom) * 100) : null,
    avgR: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
  };
}

export default function SignalsScreen() {
  const router = useRouter();
  const [signals, setSignals] = useState<SignalWithOutcome[]>([]);
  const [stats, setStats] = useState<Stats>({ urgente: 0, atencion: 0, monitorear: 0 });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Selección de activos a escanear (max 5). Vacío = escanea TODA la watchlist
  // (comportamiento previo, fallback seguro).
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);

  // Filtros
  const [filterLevel, setFilterLevel] = useState<LevelFilter>('all');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterAck, setFilterAck] = useState<AckFilter>('all');

  const filteredSignals = signals.filter((s) => {
    if (filterLevel !== 'all' && s.level !== filterLevel) return false;
    if (filterTicker && !s.ticker.toLowerCase().includes(filterTicker.toLowerCase())) return false;
    if (filterAck === 'unread' && s.acknowledged_at) return false;
    if (filterAck === 'acknowledged' && !s.acknowledged_at) return false;
    return true;
  });

  // Track-record sobre TODAS las señales (no las filtradas): es un histórico estable.
  const track = computeTrackRecord(signals);

  // Agrupado de la lista filtrada por estado de seguimiento.
  const grouped = { tracking: [] as SignalWithOutcome[], resolved: [] as SignalWithOutcome[], unfollowed: [] as SignalWithOutcome[] };
  for (const s of filteredSignals) grouped[trackStatus(s)].push(s);

  useEffect(() => {
    void load();
    void loadWatchlist();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/signals');
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/signals');
          return;
        }
        throw new Error('fetch failed');
      }
      const data = (await r.json()) as { signals: SignalWithOutcome[]; stats: Stats };
      setSignals(data.signals);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }

  async function loadWatchlist() {
    try {
      const r = await fetch('/api/watchlist');
      if (!r.ok) return; // 401 lo maneja load() arriba
      const data = (await r.json()) as { items: WatchlistItem[] };
      setWatchlistItems(data.items ?? []);
    } catch {
      // No bloqueamos la página por esto — el scan sin selección
      // sigue funcionando contra toda la watchlist en server.
    }
  }

  function toggleTicker(ticker: string) {
    setSelectedTickers((prev) => {
      if (prev.includes(ticker)) return prev.filter((t) => t !== ticker);
      if (prev.length >= MAX_SELECTABLE) return prev; // cap en cliente
      return [...prev, ticker];
    });
  }

  async function onScan() {
    setScanning(true);
    setError(null);
    try {
      // Si hay selección → enviamos solo esos tickers. Sin selección →
      // body vacío → server escanea toda la watchlist (comportamiento previo).
      const init: RequestInit = { method: 'POST' };
      if (selectedTickers.length > 0) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify({ tickers: selectedTickers });
      }
      const r = await fetch('/api/cmt/scan', init);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? 'scan failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setScanning(false);
    }
  }

  async function onAck(id: string) {
    // Optimistic update + rollback si POST falla
    const snapshot = signals;
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, acknowledged_at: new Date().toISOString() } : s)));
    try {
      const r = await fetch(`/api/signals/${id}/ack`, { method: 'POST' });
      if (!r.ok) throw new Error('ack_failed');
    } catch {
      setSignals(snapshot);
      setError('No se pudo marcar como leída — reintenta');
    }
  }

  function renderCard(s: SignalWithOutcome) {
    return (
      <SignalCard
        key={s.id}
        signal={s}
        expanded={expandedId === s.id}
        onToggle={() => setExpandedId((cur) => (cur === s.id ? null : s.id))}
        onAck={() => onAck(s.id)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : stats.urgente > 0 ? 'error' : 'ok'} />

      <SectionLabel>resumen</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5 px-4">
        <CountBox label="URGENTES" value={stats.urgente} tone="urgente" />
        <CountBox label="ATENCIÓN" value={stats.atencion} tone="atencion" />
        <CountBox label="MONITOREAR" value={stats.monitorear} tone="monitorear" />
      </div>

      {/* Track record — hit-rate REAL de las señales resueltas. Estado vacío
          honesto: sin resueltas → "—", nunca un 0% fantasma. */}
      <SectionLabel>rendimiento · señales resueltas</SectionLabel>
      <div className="px-4">
        <TrackRecordPanel track={track} />
      </div>

      {/* Selección de activos a escanear (máx 5). Sin selección → toda la
          watchlist (comportamiento previo). */}
      {watchlistItems.length > 0 && (
        <>
          <SectionLabel>
            seleccionar activos · {selectedTickers.length}/{MAX_SELECTABLE}
            {selectedTickers.length === 0 && (
              <span className="ml-1 text-white/66 normal-case">— vacío = toda la watchlist</span>
            )}
          </SectionLabel>
          <div className="px-4">
            <div className="flex flex-wrap gap-1.5">
              {watchlistItems.map((it) => {
                const active = selectedTickers.includes(it.ticker);
                const disabled = !active && selectedTickers.length >= MAX_SELECTABLE;
                return (
                  <button
                    key={it.id}
                    onClick={() => toggleTicker(it.ticker)}
                    disabled={disabled}
                    aria-pressed={active}
                    title={disabled ? `Máximo ${MAX_SELECTABLE} activos` : undefined}
                    className={cn(
                      'rounded-lg border px-2.5 py-2 font-sans text-[12px] font-bold tracking-wider transition',
                      active
                        ? 'border-white bg-white text-black'
                        : disabled
                          ? 'border-white/5 bg-surface-2 text-white/25 cursor-not-allowed'
                          : 'border-white/15 bg-surface-2 text-white/75 hover:border-white/40 hover:text-white'
                    )}
                  >
                    {it.ticker}
                  </button>
                );
              })}
              {selectedTickers.length > 0 && (
                <button
                  onClick={() => setSelectedTickers([])}
                  className="rounded-lg border border-white/10 px-2.5 py-2 font-mono text-[11px] uppercase tracking-wider text-white/66 hover:border-white/30 hover:text-white/80 transition"
                  aria-label="Limpiar selección"
                >
                  limpiar
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="px-4 pt-3">
        <button
          onClick={onScan}
          disabled={scanning}
          className="w-full rounded-lg border border-white bg-white px-3 py-2.5 font-sans text-[11px] font-bold tracking-[0.15em] text-black transition hover:bg-white/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {scanning
            ? 'ESCANEANDO…'
            : selectedTickers.length > 0
              ? `EJECUTAR SCAN · ${selectedTickers.length} ACTIVO${selectedTickers.length > 1 ? 'S' : ''} ▶`
              : 'EJECUTAR SCAN CMT ▶'}
        </button>
        <p className="mt-1.5 font-mono text-[12px] text-white/66 text-center">
          {selectedTickers.length > 0
            ? `escaneando solo: ${selectedTickers.join(' · ')}`
            : 'escanea tus tickers · usa Haiku (rápido)'}
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-white/30 bg-white/[0.06] px-3 py-2 font-mono text-[11px] text-white/80">
          {error}
        </div>
      )}

      <SectionLabel>filtros</SectionLabel>
      <div className="px-4 space-y-1.5">
        <div className="flex gap-1">
          {(['all', 'urgente', 'atencion', 'monitorear'] as const).map((lv) => (
            <button
              key={lv}
              onClick={() => setFilterLevel(lv)}
              className={cn(
                'flex-1 rounded-lg border px-2 py-3 font-mono text-[11px] uppercase tracking-wider transition',
                // Filter activo: color del nivel correspondiente. Inactivo: B&W dim.
                filterLevel === lv
                  ? lv === 'urgente'
                    ? 'border-rose/55 bg-rose/[0.12] text-rose'
                    : lv === 'atencion'
                      ? 'border-amber/55 bg-amber/[0.10] text-amber'
                      : lv === 'monitorear'
                        ? 'border-emerald/45 bg-emerald/[0.08] text-emerald'
                        : 'border-white/35 bg-white/[0.06] text-white'
                  : 'border-white/8 bg-surface-2 text-white/66 hover:border-white/20'
              )}
            >
              {lv === 'all' ? 'todas' : lv}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
            placeholder="ticker..."
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-3 font-mono text-[11px] uppercase text-white placeholder-white/45 focus:border-accent focus:outline-none"
          />
          {(['all', 'unread', 'acknowledged'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setFilterAck(a)}
              className={cn(
                'rounded-lg border px-2 py-3 font-mono text-[11px] uppercase tracking-wider transition',
                filterAck === a
                  ? 'border-white/40 bg-white/[0.06] text-white'
                  : 'border-white/8 bg-surface-2 text-white/66 hover:border-white/20'
              )}
            >
              {a === 'all' ? 'todas' : a === 'unread' ? 'no leídas' : 'leídas'}
            </button>
          ))}
        </div>
      </div>

      <SectionLabel>
        historial · {filteredSignals.length === signals.length ? signals.length : `${filteredSignals.length} de ${signals.length}`}
      </SectionLabel>
      {loading ? (
        <div className="px-4 py-8 text-center font-mono text-[11px] text-white/70">cargando señales…</div>
      ) : signals.length === 0 ? (
        <div className="mx-4 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-8 text-center">
          <div className="text-2xl text-slate-l opacity-15 mb-1">⚡</div>
          <div className="font-mono text-[11px] text-white/70 mb-1">sin señales</div>
          <div className="font-mono text-[12px] text-white/66">
            añade activos a tu watchlist y ejecuta un scan
          </div>
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="mx-4 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-6 text-center">
          <div className="font-mono text-[11px] text-white/70">ninguna señal cumple los filtros</div>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.tracking.length > 0 && (
            <GroupSection label="en seguimiento" count={grouped.tracking.length}>
              {grouped.tracking.map(renderCard)}
            </GroupSection>
          )}
          {grouped.resolved.length > 0 && (
            <GroupSection label="resueltas" count={grouped.resolved.length}>
              {grouped.resolved.map(renderCard)}
            </GroupSection>
          )}
          {grouped.unfollowed.length > 0 && (
            <GroupSection label="no seguidas" count={grouped.unfollowed.length} muted>
              {grouped.unfollowed.map(renderCard)}
            </GroupSection>
          )}
        </div>
      )}

      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-white/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

// ── Track record (resumen hit-rate) ──────────────────────────────────────────
function TrackRecordPanel({ track }: { track: TrackRecord }) {
  const empty = track.denom === 0;
  return (
    <div className="rounded-[15px] border border-white/8 bg-surface-2 px-3.5 py-3">
      <div className="flex items-center gap-4">
        {/* Hit-rate */}
        <div className="flex flex-col items-center">
          <div className={cn('font-mono text-[28px] font-black leading-none', empty ? 'text-white/66' : 'text-white')}>
            {empty ? '—' : `${track.hitRate}%`}
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-white/66">hit-rate</div>
        </div>

        {/* Detalle */}
        <div className="flex-1">
          {empty ? (
            <div className="font-mono text-[11px] leading-snug text-white/66">
              sin señales resueltas todavía — el seguimiento corre cada noche y
              clasificará las señales 1D al tocar target o stop.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <OutcomeChip label="win" n={track.win} cls="text-emerald border-emerald/35 bg-emerald/[0.07]" />
                <OutcomeChip label="loss" n={track.loss} cls="text-rose border-rose/35 bg-rose/[0.07]" />
                <OutcomeChip label="timeout" n={track.timeout} cls="text-amber border-amber/30 bg-amber/[0.06]" />
                {track.noFill > 0 && (
                  <OutcomeChip label="no fill" n={track.noFill} cls="text-white/66 border-white/12 bg-white/[0.02]" />
                )}
              </div>
              <div className="mt-1.5 font-mono text-[11px] text-white/66">
                {track.denom} resuelta{track.denom > 1 ? 's' : ''}
                {track.avgR != null && (
                  <>
                    {' · R medio '}
                    <span className={cn('font-medium', track.avgR >= 0 ? 'text-emerald' : 'text-rose')}>
                      {track.avgR >= 0 ? '+' : ''}
                      {track.avgR.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OutcomeChip({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[11px] tabular-nums', cls)}>
      {n} <span className="uppercase tracking-wider opacity-80">{label}</span>
    </span>
  );
}

// ── Grupo de la lista (en seguimiento / resueltas / no seguidas) ──────────────
function GroupSection({
  label,
  count,
  muted,
  children,
}: {
  label: string;
  count: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-1 pb-1.5">
        <span
          className={cn(
            'font-mono text-[11px] font-medium uppercase tracking-[0.12em]',
            muted ? 'text-white/66' : 'text-white/70'
          )}
        >
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-white/66">{count}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      <div className={cn('px-4 space-y-1.5', muted && 'opacity-75')}>{children}</div>
    </div>
  );
}

function CountBox({ label, value, tone }: { label: string; value: number; tone: SignalLevel }) {
  // Sesión 5b: color semántico back. La urgencia se comunica por COLOR
  // (rose>amber>emerald) + ANIMACIÓN (solo urgente pulsa cuando hay >0).
  // Cuando count=0, el box queda dim — el ojo no se distrae con ceros.
  const active = value > 0;
  const cls =
    tone === 'urgente'
      ? active
        ? 'text-rose border-rose/45 bg-rose/[0.10] animate-urg-pulse'
        : 'text-rose/30 border-rose/12 bg-rose/[0.02]'
      : tone === 'atencion'
        ? active
          ? 'text-amber border-amber/45 bg-amber/[0.08]'
          : 'text-amber/30 border-amber/12 bg-amber/[0.02]'
        : active
          ? 'text-emerald border-emerald/40 bg-emerald/[0.07]'
          : 'text-emerald/30 border-emerald/12 bg-emerald/[0.02]';
  return (
    <div className={cn('rounded-[15px] border px-2 py-2.5 text-center transition-all', cls)}>
      <div className="font-mono text-[20px] font-black">{value}</div>
      <div className="font-mono text-[11px] tracking-wider opacity-80 mt-0.5">{label}</div>
    </div>
  );
}

/**
 * levelMeta — color semántico por nivel de urgencia.
 *   urgente    → rose pulsing  (acción inmediata)
 *   atencion   → amber         (1-3 sesiones de seguimiento)
 *   monitorear → emerald       (en el radar, sin trigger)
 *   sin_senal  → slate         (ruido, no operar)
 */
function levelMeta(level: SignalLevel) {
  if (level === 'urgente') return { band: 'bg-rose', text: 'text-rose', label: 'URGENTE', pulse: true };
  if (level === 'atencion') return { band: 'bg-amber', text: 'text-amber', label: 'ATENCIÓN', pulse: false };
  if (level === 'monitorear') return { band: 'bg-emerald', text: 'text-emerald', label: 'MONITOREAR', pulse: false };
  return { band: 'bg-white/20', text: 'text-white/66', label: 'SIN SEÑAL', pulse: false };
}

/**
 * outcomeMeta — color SEMÁNTICO del resultado del trade (no decorativo):
 *   win→emerald · loss→rose · timeout→amber · no_fill/not_evaluable→neutro.
 */
function outcomeMeta(outcome: string): { label: string; cls: string } {
  switch (outcome) {
    case 'win':
      return { label: 'WIN', cls: 'text-emerald border-emerald/40 bg-emerald/[0.08]' };
    case 'loss':
      return { label: 'LOSS', cls: 'text-rose border-rose/40 bg-rose/[0.08]' };
    case 'timeout':
      return { label: 'TIMEOUT', cls: 'text-amber border-amber/35 bg-amber/[0.07]' };
    case 'no_fill':
      return { label: 'NO FILL', cls: 'text-white/66 border-white/15 bg-white/[0.03]' };
    default:
      return { label: 'NO EVALUABLE', cls: 'text-white/66 border-white/10 bg-white/[0.02]' };
  }
}

function SignalCard({
  signal,
  expanded,
  onToggle,
  onAck,
}: {
  signal: SignalWithOutcome;
  expanded: boolean;
  onToggle: () => void;
  onAck: () => void;
}) {
  const meta = levelMeta(signal.level);
  const acknowledged = !!signal.acknowledged_at;
  const emitted = new Date(signal.emitted_at);
  const indicators = (signal.indicators ?? {}) as Record<string, string>;
  const ccy = getCurrencyFromTicker(signal.ticker);
  const out = signal.outcome;
  const isResolved = out != null && RESOLVED_OUTCOMES.has(out.outcome);
  const fmtPx = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : `${v} ${ccy}`;

  function copyReport() {
    const lines = [
      `${signal.ticker} · ${meta.label} · ${signal.timeframe}`,
      `Confianza: ${signal.confidence_pct}%`,
      `Setup: ${signal.setup_detected}`,
      `Entrada: ${fmtPx(signal.entry_price)} · Stop: ${fmtPx(signal.stop_loss)} · Target: ${fmtPx(signal.target_price)}`,
      `R/B: ${signal.risk_reward_ratio?.toFixed(2) ?? '—'}`,
      `Invalida: ${signal.invalidation_factor}`,
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[15px] border bg-surface-2 transition-all',
        acknowledged ? 'border-white/5 opacity-60' : 'border-white/10',
        meta.pulse && !acknowledged && 'animate-urg-pulse'
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', meta.band)} />
      <button onClick={onToggle} className="block w-full px-3 pl-4 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[13px] font-bold tracking-wider text-white">{signal.ticker}</span>
              <span className={cn('font-mono text-[11px] font-medium uppercase tracking-wider', meta.text)}>
                {meta.label}
              </span>
              <span className="rounded border border-white/15 bg-white/[0.03] px-1.5 py-px font-mono text-[12px] tracking-wider text-white/70">
                {signal.timeframe}
              </span>
            </div>
            <div className="font-mono text-[12px] text-slate-l mt-0.5 line-clamp-1">
              {signal.setup_detected}
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            {out && <OutcomeBadge outcome={out} />}
            <div className={cn('font-sans text-[14px] font-bold', meta.text)}>
              {signal.confidence_pct}%
            </div>
            <div className="font-mono text-[12px] text-white/66">{emitted.toLocaleTimeString().slice(0, 5)}</div>
          </div>
          <span className="font-mono text-[14px] text-slate-l opacity-50">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 pl-4 py-2.5">
          {/* Resultado del trade (si ya se evaluó) */}
          {out && (
            <div className="mb-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-white/66 mb-1">Resultado</div>
              {isResolved ? (
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <OutcomeBadge outcome={out} />
                  {out.r_multiple != null && (
                    <span className={cn('font-medium', out.r_multiple >= 0 ? 'text-emerald' : 'text-rose')}>
                      {out.r_multiple >= 0 ? '+' : ''}
                      {out.r_multiple.toFixed(2)}R
                    </span>
                  )}
                  {out.return_pct != null && (
                    <span className="text-white/70">
                      {out.return_pct >= 0 ? '+' : ''}
                      {out.return_pct.toFixed(1)}%
                    </span>
                  )}
                  {out.resolved_days != null && (
                    <span className="text-white/66">· {out.resolved_days}d hasta resolución</span>
                  )}
                </div>
              ) : (
                <div className="font-mono text-[11px] text-white/66">
                  no evaluable — geometría de niveles degenerada (no se pudo inferir dirección).
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-2">
            <KV label={`ENTRADA · ${ccy}`} value={fmtPx(signal.entry_price)} />
            <KV label={`▼ STOP · ${ccy}`} value={fmtPx(signal.stop_loss)} cls="text-rose" />
            <KV label={`▲ TARGET · ${ccy}`} value={fmtPx(signal.target_price)} cls="text-emerald" />
          </div>
          <KV label="R/B" value={signal.risk_reward_ratio?.toFixed(2) ?? '—'} cls="text-amber" />

          {Object.keys(indicators).length > 0 && (
            <div className="mt-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-white/66 mb-1">Indicadores</div>
              <div className="space-y-1">
                {Object.entries(indicators).map(([k, v]) => (
                  <div key={k} className="font-mono text-[12px]">
                    <span className="text-white/66">{k}: </span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 border-t border-white/5 pt-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-rose mb-0.5">Invalida si</div>
            <div className="font-mono text-[12px] text-white/90">{signal.invalidation_factor}</div>
          </div>

          <div className="mt-3 flex gap-1.5">
            <button
              onClick={copyReport}
              className="flex-1 rounded-lg border border-white/10 px-2 py-3 font-mono text-[11px] text-white/66 hover:border-white/35 hover:text-white transition"
            >
              copiar reporte
            </button>
            {!acknowledged && (
              <button
                onClick={onAck}
                className="flex-1 rounded-lg border border-emerald/25 bg-emerald/[0.04] px-2 py-3 font-mono text-[11px] text-emerald hover:bg-emerald/[0.08] hover:border-emerald/40 transition"
              >
                marcar leído
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Badge compacto del outcome del trade. Muestra ±R si está resuelto con R. */
function OutcomeBadge({ outcome }: { outcome: SignalTradeOutcome }) {
  const m = outcomeMeta(outcome.outcome);
  const showR = RESOLVED_OUTCOMES.has(outcome.outcome) && outcome.outcome !== 'no_fill' && outcome.r_multiple != null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-wider', m.cls)}>
      {m.label}
      {showR && (
        <span className="tabular-nums opacity-90">
          {outcome.r_multiple! >= 0 ? '+' : ''}
          {outcome.r_multiple!.toFixed(1)}R
        </span>
      )}
    </span>
  );
}

function KV({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-3">
      <div className="font-mono text-[11px] uppercase tracking-wider text-white/66 mb-0.5">{label}</div>
      <div className={cn('font-mono text-[11px] font-medium text-white', cls)}>{value}</div>
    </div>
  );
}
