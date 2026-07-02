'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { cn } from '@/lib/utils';
import type { SignalLevel, WatchlistItem } from '@/types/db';
import {
  type SignalWithOutcome,
  trackStatus,
  computeTrackRecord,
} from '@/components/signals/helpers';
import { TrackRecordPanel } from '@/components/signals/track-record';
import { CountBox } from '@/components/signals/primitives';
import { SignalCard, GroupSection } from '@/components/signals/signal-card';

interface Stats {
  urgente: number;
  atencion: number;
  monitorear: number;
}

const MAX_SELECTABLE = 5;

type LevelFilter = 'all' | SignalLevel;
type AckFilter = 'all' | 'unread' | 'acknowledged';

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
        onAnalyze={() =>
          router.push(`/analysis?ticker=${encodeURIComponent(s.ticker)}&from=signal`)
        }
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
              <span className="ml-1 text-ink/66 normal-case">— vacío = toda la watchlist</span>
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
                        ? 'border-ink bg-ink text-void'
                        : disabled
                          ? 'border-white/5 bg-surface-2 text-ink/25 cursor-not-allowed'
                          : 'border-white/15 bg-surface-2 text-ink/75 hover:border-white/40 hover:text-ink'
                    )}
                  >
                    {it.ticker}
                  </button>
                );
              })}
              {selectedTickers.length > 0 && (
                <button
                  onClick={() => setSelectedTickers([])}
                  className="rounded-lg border border-white/10 px-2.5 py-2 font-mono text-[11px] uppercase tracking-wider text-ink/66 hover:border-white/30 hover:text-ink/80 transition"
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
          className="w-full rounded-lg border border-ink bg-ink px-3 py-2.5 font-sans text-[11px] font-bold tracking-[0.15em] text-void transition hover:bg-ink/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {scanning
            ? 'BUSCANDO…'
            : selectedTickers.length > 0
              ? `Buscar en ${selectedTickers.length} activo${selectedTickers.length > 1 ? 's' : ''} ▶`
              : 'Buscar señales ahora ▶'}
        </button>
        <p className="mt-1.5 font-mono text-[12px] text-ink/66 text-center">
          {selectedTickers.length > 0
            ? `buscando solo en: ${selectedTickers.join(' · ')}`
            : 'revisa tus activos en busca de señales técnicas · resultado al instante'}
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-white/30 bg-white/[0.06] px-3 py-2 font-mono text-[11px] text-ink/80">
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
              aria-pressed={filterLevel === lv}
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
                        : 'border-white/35 bg-white/[0.06] text-ink'
                  : 'border-white/8 bg-surface-2 text-ink/66 hover:border-white/20'
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
            aria-label="Filtrar por ticker"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-3 font-mono text-[11px] uppercase text-ink placeholder-ink/45 focus:border-accent"
          />
          {(['all', 'unread', 'acknowledged'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setFilterAck(a)}
              aria-pressed={filterAck === a}
              className={cn(
                'rounded-lg border px-2 py-3 font-mono text-[11px] uppercase tracking-wider transition',
                filterAck === a
                  ? 'border-white/40 bg-white/[0.06] text-ink'
                  : 'border-white/8 bg-surface-2 text-ink/66 hover:border-white/20'
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
        <div className="px-4 py-8 text-center font-mono text-[11px] text-ink/70">cargando señales…</div>
      ) : signals.length === 0 ? (
        <div className="mx-4 rounded-card-sm border border-dashed border-white/10 bg-surface-2 px-3 py-8 text-center">
          <div className="text-2xl text-slate-l opacity-15 mb-1">⚡</div>
          <div className="font-mono text-[11px] text-ink/70 mb-1">sin señales</div>
          <div className="font-mono text-[12px] text-ink/66">
            añade activos a tu watchlist y ejecuta un scan
          </div>
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="mx-4 rounded-card-sm border border-dashed border-white/10 bg-surface-2 px-3 py-6 text-center">
          <div className="font-mono text-[11px] text-ink/70">ninguna señal cumple los filtros</div>
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

      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-ink/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

