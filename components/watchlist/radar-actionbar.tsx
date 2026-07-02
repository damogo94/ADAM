'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SectionLabel } from '@/components/section-label';
import { CountBox } from '@/components/signals/primitives';
import { TrackRecordPanel } from '@/components/signals/track-record';
import { SignalCard, GroupSection } from '@/components/signals/signal-card';
import {
  type SignalWithOutcome,
  computeTrackRecord,
  trackStatus,
} from '@/components/signals/helpers';
import type { RadarRow_t } from '@/lib/radar/types';

/**
 * RadarActionbar — barra de acción global del radar accionable (F4). Absorbe lo
 * que antes era la pantalla /signals:
 *
 *  1. 3 contadores de urgencia POR TICKER (no por señal): cuenta filas del radar
 *     con `signal` no-null agrupadas por su `level`. Semántica: "cuántos tickers
 *     de mi watchlist tienen una señal CMT activa de nivel X" (una fila = un
 *     ticker). Distinto de /signals, que contaba señales sueltas.
 *  2. TrackRecordPanel alimentado por un fetch INDEPENDIENTE a GET /api/signals
 *     (histórico real de señales resueltas) — NO por el radar.
 *  3. "Buscar señales ahora": POST /api/cmt/scan (body vacío = toda la watchlist;
 *     avanzado plegado = hasta 5 tickers). Tras el scan recarga el radar.
 *  4. Filtro-vista "solo con señal activa" (toggle, lo aplica la page a las rows).
 *  5. "Ver histórico" (toggle, sub-vista colapsada) que reutiliza el fetch de
 *     /api/signals con la agrupación trackStatus (tracking/resolved/unfollowed)
 *     y las tarjetas compartidas de /signals (SignalCard/GroupSection).
 */

const MAX_SELECTABLE = 5;

interface RadarActionbarProps {
  /** Filas del radar (para derivar los contadores por ticker). */
  rows: RadarRow_t[];
  /** Tickers de la watchlist para la selección avanzada del scan. */
  tickers: string[];
  /** Estado del toggle "solo con señal activa" (lo posee la page). */
  onlyWithSignal: boolean;
  onToggleOnlyWithSignal: () => void;
  /** Recarga el radar tras un scan (reload del RadarProvider). */
  onReloadRadar: () => Promise<void>;
}

interface SignalsData {
  signals: SignalWithOutcome[];
}

export function RadarActionbar({
  rows,
  tickers,
  onlyWithSignal,
  onToggleOnlyWithSignal,
  onReloadRadar,
}: RadarActionbarProps) {
  const router = useRouter();

  // Histórico de señales — fetch INDEPENDIENTE del radar (track-record + sub-vista).
  const [signals, setSignals] = useState<SignalWithOutcome[]>([]);
  const [histError, setHistError] = useState<string | null>(null);

  // Scan
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);

  // Sub-vista histórico
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory() {
    try {
      const r = await fetch('/api/signals');
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/watchlist');
          return;
        }
        throw new Error('fetch_failed');
      }
      const data = (await r.json()) as SignalsData;
      setSignals(data.signals ?? []);
    } catch (e) {
      setHistError(e instanceof Error ? e.message : 'unknown');
    }
  }

  // ── 1. Contadores de urgencia POR TICKER (filas con señal no-null · su level).
  const counts = useMemo(() => {
    const c = { urgente: 0, atencion: 0, monitorear: 0 };
    for (const row of rows) {
      const lvl = row.signal?.level;
      if (lvl === 'urgente' || lvl === 'atencion' || lvl === 'monitorear') c[lvl]++;
    }
    return c;
  }, [rows]);

  // ── 2. Track record (histórico completo, estable).
  const track = useMemo(() => computeTrackRecord(signals), [signals]);

  // ── 5. Agrupación de la sub-vista histórico.
  const grouped = useMemo(() => {
    const g = {
      tracking: [] as SignalWithOutcome[],
      resolved: [] as SignalWithOutcome[],
      unfollowed: [] as SignalWithOutcome[],
    };
    for (const s of signals) g[trackStatus(s)].push(s);
    return g;
  }, [signals]);

  function toggleTicker(ticker: string) {
    setSelectedTickers((prev) => {
      if (prev.includes(ticker)) return prev.filter((t) => t !== ticker);
      if (prev.length >= MAX_SELECTABLE) return prev; // cap cliente
      return [...prev, ticker];
    });
  }

  async function onScan() {
    setScanning(true);
    setScanError(null);
    try {
      // Body vacío → server escanea TODA la watchlist (default). Con selección →
      // solo esos tickers (avanzado).
      const init: RequestInit = { method: 'POST' };
      if (selectedTickers.length > 0) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify({ tickers: selectedTickers });
      }
      const r = await fetch('/api/cmt/scan', init);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? 'scan_failed');
      // Recarga silenciosa: el radar recoge las nuevas señales; el histórico las
      // resueltas. Ambos en paralelo.
      await Promise.all([onReloadRadar(), loadHistory()]);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setScanning(false);
    }
  }

  async function onAckHistory(id: string) {
    const snapshot = signals;
    setSignals((prev) =>
      prev.map((s) => (s.id === id ? { ...s, acknowledged_at: new Date().toISOString() } : s))
    );
    try {
      const r = await fetch(`/api/signals/${id}/ack`, { method: 'POST' });
      if (!r.ok) throw new Error('ack_failed');
    } catch {
      setSignals(snapshot);
      setHistError('No se pudo marcar como leída — reintenta');
    }
  }

  const totalWithSignal = counts.urgente + counts.atencion + counts.monitorear;

  return (
    <div className="mt-3">
      {/* 1 · Contadores por ticker */}
      <SectionLabel>tickers con señal activa</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5 px-4">
        <CountBox label="URGENTES" value={counts.urgente} tone="urgente" />
        <CountBox label="ATENCIÓN" value={counts.atencion} tone="atencion" />
        <CountBox label="MONITOREAR" value={counts.monitorear} tone="monitorear" />
      </div>

      {/* 2 · Track record (histórico independiente del radar) */}
      <SectionLabel>rendimiento · señales resueltas</SectionLabel>
      <div className="px-4">
        <TrackRecordPanel track={track} />
      </div>

      {/* 3 · Buscar señales ahora + avanzado plegado */}
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={() => void onScan()}
          disabled={scanning}
          className="w-full rounded-lg border border-ink bg-ink px-3 py-2.5 font-sans text-[11px] font-bold tracking-[0.15em] text-void transition hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {scanning
            ? 'BUSCANDO…'
            : selectedTickers.length > 0
              ? `Buscar en ${selectedTickers.length} activo${selectedTickers.length > 1 ? 's' : ''} ▶`
              : 'Buscar señales ahora ▶'}
        </button>
        <p className="mt-1.5 text-center font-mono text-[12px] text-ink/66">
          {selectedTickers.length > 0
            ? `buscando solo en: ${selectedTickers.join(' · ')}`
            : 'escanea toda tu watchlist en busca de señales técnicas · resultado al instante'}
        </p>

        {tickers.length > 0 && (
          <details
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="mt-2"
          >
            <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-ink/66 hover:text-ink/85">
              {advancedOpen ? '▾' : '▸'} avanzado · elegir activos ({selectedTickers.length}/{MAX_SELECTABLE})
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tickers.map((t) => {
                const active = selectedTickers.includes(t);
                const disabled = !active && selectedTickers.length >= MAX_SELECTABLE;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTicker(t)}
                    disabled={disabled}
                    aria-pressed={active}
                    title={disabled ? `Máximo ${MAX_SELECTABLE} activos` : undefined}
                    className={cn(
                      'rounded-lg border px-2.5 py-2 font-sans text-[12px] font-bold tracking-wider transition',
                      active
                        ? 'border-ink bg-ink text-void'
                        : disabled
                          ? 'cursor-not-allowed border-white/5 bg-surface-2 text-ink/25'
                          : 'border-white/15 bg-surface-2 text-ink/75 hover:border-white/40 hover:text-ink'
                    )}
                  >
                    {t}
                  </button>
                );
              })}
              {selectedTickers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTickers([])}
                  className="rounded-lg border border-white/10 px-2.5 py-2 font-mono text-[11px] uppercase tracking-wider text-ink/66 transition hover:border-white/30 hover:text-ink/80"
                  aria-label="Limpiar selección"
                >
                  limpiar
                </button>
              )}
            </div>
          </details>
        )}

        {scanError && (
          <div className="mt-2 rounded-lg border border-white/30 bg-white/[0.06] px-3 py-2 font-mono text-[11px] text-ink/80">
            {scanError}
          </div>
        )}
      </div>

      {/* 4 · Filtro-vista "solo con señal activa" + 5 · toggle histórico */}
      <div className="mt-3 flex items-center gap-1.5 px-4">
        <button
          type="button"
          onClick={onToggleOnlyWithSignal}
          aria-pressed={onlyWithSignal}
          className={cn(
            'flex-1 rounded-lg border px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider transition',
            onlyWithSignal
              ? 'border-white/40 bg-white/[0.06] text-ink'
              : 'border-white/8 bg-surface-2 text-ink/66 hover:border-white/20'
          )}
        >
          solo con señal activa
          {totalWithSignal > 0 && <span className="ml-1 text-ink/45">· {totalWithSignal}</span>}
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          className={cn(
            'flex-1 rounded-lg border px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider transition',
            historyOpen
              ? 'border-white/40 bg-white/[0.06] text-ink'
              : 'border-white/8 bg-surface-2 text-ink/66 hover:border-white/20'
          )}
        >
          {historyOpen ? '▾' : '▸'} ver histórico
          {signals.length > 0 && <span className="ml-1 text-ink/45">· {signals.length}</span>}
        </button>
      </div>

      {/* 5 · Sub-vista histórico (colapsada por defecto) */}
      {historyOpen && (
        <div className="mt-2">
          {histError && (
            <div className="mx-4 mb-2 rounded-lg border border-white/30 bg-white/[0.06] px-3 py-2 font-mono text-[11px] text-ink/80">
              {histError}
            </div>
          )}
          {signals.length === 0 ? (
            <div className="mx-4 rounded-card-sm border border-dashed border-white/10 bg-surface-2 px-3 py-6 text-center">
              <div className="font-mono text-[11px] text-ink/70">sin señales en el histórico</div>
              <div className="mt-1 font-mono text-[12px] text-ink/66">
                ejecuta un scan para poblar tu historial
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.tracking.length > 0 && (
                <GroupSection label="en seguimiento" count={grouped.tracking.length}>
                  {grouped.tracking.map(renderHistoryCard)}
                </GroupSection>
              )}
              {grouped.resolved.length > 0 && (
                <GroupSection label="resueltas" count={grouped.resolved.length}>
                  {grouped.resolved.map(renderHistoryCard)}
                </GroupSection>
              )}
              {grouped.unfollowed.length > 0 && (
                <GroupSection label="no seguidas" count={grouped.unfollowed.length} muted>
                  {grouped.unfollowed.map(renderHistoryCard)}
                </GroupSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  function renderHistoryCard(s: SignalWithOutcome) {
    return (
      <SignalCard
        key={s.id}
        signal={s}
        expanded={expandedId === s.id}
        onToggle={() => setExpandedId((cur) => (cur === s.id ? null : s.id))}
        onAck={() => void onAckHistory(s.id)}
        onAnalyze={() =>
          router.push(`/analysis?ticker=${encodeURIComponent(s.ticker)}&from=radar`)
        }
      />
    );
  }
}
