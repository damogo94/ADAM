'use client';

/**
 * Watchlist · panel de favoritos (feature/watchlist-panel).
 *
 * Construye encima del radar de atención:
 *   - Add/remove/pin de favoritos persistido por usuario (RLS).
 *   - Pinneados arriba (ordenados por pinned_at desc); resto por
 *     prioridad del radar (la RPC ya ordena así).
 *   - Sparkline mini-tendencia 7D/30D (toggle global) por activo,
 *     color por dictamen A4.
 *   - Skeleton durante carga inicial. Estado vacío cuidado.
 *   - prefers-reduced-motion respetado (motion-safe:animate-pulse en skel).
 *
 * Datos: GET /api/watchlist/radar (Supabase RPC + quotes paralelos)
 *        GET /api/market/sparklines (Yahoo, cache Upstash 15min)
 *
 * Cero cambios en lógica de agentes ni /api/agents/*.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { AssetPicker } from '@/components/asset-picker';
import { RadarRow } from '@/components/watchlist/radar-row';
import { DigestHeader } from '@/components/watchlist/digest-header';
import { SkeletonRow } from '@/components/watchlist/skeleton-row';
import { useRadar } from '@/components/analysis/radar-provider';
import { cn } from '@/lib/utils';
import { SparklinesResponse, type SparklineRange_t } from '@/lib/sparkline/types';
import type { AssetType } from '@/types/db';

export default function WatchlistScreen() {
  const router = useRouter();
  // Radar AMBIENTAL del shell (RadarProvider): compartido con /analysis, cargado
  // una vez por sesión. setRadar/setError para las mutaciones optimistas; reload
  // tras un CRUD. (B1·F2: la page ya no hace su propio fetch de /radar.)
  const { radar, setRadar, loading, error, reload, setError } = useRadar();
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [sparkRange, setSparkRange] = useState<SparklineRange_t>('30d');
  const [newTicker, setNewTicker] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetType>('equity');
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Clave estable del CONJUNTO de tickers (ordenada y deduplicada): así un
  // pin/reorden — que crea un nuevo objeto `radar` pero no cambia qué activos
  // hay — no dispara un refetch. Solo cambia al añadir/quitar un activo.
  const tickerKey = [...new Set((radar?.rows ?? []).map((r) => r.ticker))]
    .sort()
    .join(',');

  // Recarga sparklines cuando cambia el rango (toggle 7d/30d) o el conjunto de
  // tickers. Aborta el fetch anterior en cleanup para que una respuesta lenta
  // de un set previo no sobrescriba a una más reciente (race → datos stale).
  useEffect(() => {
    if (!tickerKey) {
      setSparklines({});
      return;
    }
    const ctrl = new AbortController();
    void loadSparklines(tickerKey.split(','), sparkRange, ctrl.signal);
    return () => ctrl.abort();
  }, [tickerKey, sparkRange]);

  async function loadSparklines(
    tickers: string[],
    range: SparklineRange_t,
    signal?: AbortSignal
  ) {
    try {
      const qs = new URLSearchParams({
        symbols: tickers.join(','),
        range,
      }).toString();
      const r = await fetch(`/api/market/sparklines?${qs}`, { signal });
      if (!r.ok) return; // degradación silenciosa — la página funciona sin sparklines
      const data = await r.json();
      const parsed = SparklinesResponse.safeParse(data);
      if (!parsed.success) return;
      if (signal?.aborted) return; // respuesta obsoleta — un fetch más nuevo la reemplazó
      const next: Record<string, number[]> = {};
      for (const s of parsed.data.series) {
        next[s.symbol] = s.closes;
      }
      setSparklines(next);
    } catch {
      // Silencio total: AbortError (cleanup) o fallo de red no rompen UX.
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!newTicker.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const r = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: newTicker.trim().toUpperCase(), asset_type: newAssetType }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? 'add_failed');
      setNewTicker('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setAdding(false);
    }
  }

  async function onAddFromPicker(ticker: string) {
    setAdding(true);
    setError(null);
    try {
      const r = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, asset_type: newAssetType }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? 'add_failed');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setAdding(false);
    }
  }

  async function onConfirmDelete(itemId: string) {
    // Optimistic delete sobre radar.rows. Si el server falla, rollback.
    const prevRadar = radar;
    setRadar((cur) => (cur ? { ...cur, rows: cur.rows.filter((r) => r.item_id !== itemId) } : cur));
    setConfirmDeleteId(null);
    const r = await fetch(`/api/watchlist/${itemId}`, { method: 'DELETE' });
    if (!r.ok) {
      setRadar(prevRadar);
      setError('No se pudo borrar — reintenta');
    }
  }

  async function onTogglePin(itemId: string, currentlyPinned: boolean) {
    // Optimistic: marca pinned y reordena en cliente. Refetch para que el
    // server confirme pinned_at + orden definitivo.
    const prevRadar = radar;
    setRadar((cur) => {
      if (!cur) return cur;
      const updated = cur.rows.map((r) =>
        r.item_id === itemId
          ? { ...r, is_pinned: !currentlyPinned, pinned_at: !currentlyPinned ? new Date().toISOString() : null }
          : r
      );
      // Reordena: pinned desc, pinned_at desc, position asc.
      updated.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        if (a.is_pinned && b.is_pinned) {
          const ta = a.pinned_at ? Date.parse(a.pinned_at) : 0;
          const tb = b.pinned_at ? Date.parse(b.pinned_at) : 0;
          return tb - ta;
        }
        return a.position - b.position;
      });
      return { ...cur, rows: updated };
    });
    try {
      const r = await fetch(`/api/watchlist/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !currentlyPinned }),
      });
      if (!r.ok) throw new Error('pin_failed');
      // Refetch silencioso para sincronizar pinned_at del server.
      void reload();
    } catch {
      setRadar(prevRadar);
      setError('No se pudo fijar — reintenta');
    }
  }

  const onDigestSelect = useCallback((ticker: string) => {
    setHighlight(ticker);
    const el = rowRefs.current.get(ticker);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setHighlight((cur) => (cur === ticker ? null : cur)), 3500);
  }, []);

  const rows = radar?.rows ?? [];
  const digest = radar?.digest ?? [];
  const generatedAt = radar?.generated_at;
  const isInitialLoading = loading && !radar;

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : rows.length ? 'ok' : 'offline'} />

      {/* "Se aprende aquí": indicador discreto de que los términos técnicos
          son explicables al tocarlos. La palabra "subrayados" lleva el mismo
          subrayado dashed que el affordance real → telegrafía qué buscar. */}
      <div className="mx-4 mt-2 flex items-center gap-1.5 font-mono text-[11px] leading-snug text-white/66">
        <span aria-hidden="true" className="text-[13px] leading-none text-white/70">ⓘ</span>
        <span>
          Los términos{' '}
          <span className="border-b border-dashed border-white/45 text-white/75">subrayados</span>{' '}
          se explican al tocarlos
        </span>
      </div>
      <div className="mt-2.5" />
      <DigestHeader entries={digest} onSelect={onDigestSelect} generatedAt={generatedAt} />

      {/* Form alta */}
      <form onSubmit={onAdd} className="px-4 pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={adding}
            className={cn(
              'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04]',
              'text-[14px] leading-none text-white/70 transition-all',
              'hover:border-white/40 hover:bg-white/[0.08] hover:text-white',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
            aria-label="Catálogo"
            title="Catálogo"
          >
            <span aria-hidden="true">⊞</span>
          </button>
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="ticker (AAPL, BTC, EUR/USD…)"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[12px] uppercase text-white placeholder-white/45 focus:border-accent focus:outline-none"
          />
          <select
            value={newAssetType}
            onChange={(e) => setNewAssetType(e.target.value as AssetType)}
            className="rounded-lg border border-white/10 bg-black/40 px-2 py-2.5 font-mono text-[12px] text-white focus:border-accent focus:outline-none"
          >
            <option value="equity">equity</option>
            <option value="etf">etf</option>
            <option value="crypto">crypto</option>
            <option value="forex">forex</option>
            <option value="commodity">commodity</option>
            <option value="bond">bond</option>
          </select>
          <button
            type="submit"
            disabled={adding}
            className="rounded-lg border border-white bg-white px-3 py-2.5 font-sans text-[12px] font-bold tracking-[0.12em] text-black transition hover:bg-white/85 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? '…' : '+'}
          </button>
        </div>
      </form>

      <AssetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(ticker) => {
          setPickerOpen(false);
          void onAddFromPicker(ticker);
        }}
      />

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-white/30 bg-white/[0.06] px-3 py-2 font-mono text-[12px] text-white/80">
          {error}
        </div>
      )}

      {/* Toggle de rango del sparkline */}
      <div className="mx-4 mt-3 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/66">
          activos en radar · {rows.length}
        </span>
        <div
          role="radiogroup"
          aria-label="Rango del sparkline"
          className="inline-flex items-center gap-px rounded-full border border-white/10 bg-black/40 p-px"
        >
          {(['7d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={sparkRange === r}
              onClick={() => setSparkRange(r)}
              className={cn(
                'rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition',
                sparkRange === r ? 'bg-white text-black' : 'text-white/66 hover:text-white'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2" />
      {isInitialLoading ? (
        <div className="px-4 space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : rows.length === 0 ? (
        <div className="mx-4 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-10 text-center">
          <div className="text-2xl text-slate-l opacity-15 mb-1">◎</div>
          <div className="font-sans text-[11px] tracking-wider text-white/80 mb-1">
            sin activos en radar
          </div>
          <div className="font-mono text-[11px] text-white/66 leading-relaxed">
            añade tu primer activo con <span className="text-white/75">⊞ catálogo</span> o
            <br />
            escribiendo un ticker arriba (AAPL · BTC · EUR/USD…)
          </div>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {rows.map((row) => (
            <div
              key={row.item_id}
              ref={(el) => {
                if (el) rowRefs.current.set(row.ticker, el);
                else rowRefs.current.delete(row.ticker);
              }}
            >
              <RadarRow
                row={row}
                sparklineCloses={sparklines[row.ticker]}
                highlighted={highlight === row.ticker}
                onAnalyze={() => router.push(`/analysis?ticker=${encodeURIComponent(row.ticker)}&from=radar`)}
                onDelete={() => setConfirmDeleteId(row.item_id)}
                onTogglePin={() => void onTogglePin(row.item_id, row.is_pinned)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmación de borrado (inline, no library) */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setConfirmDeleteId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="rounded-[15px] border border-rose/30 bg-surface-2 px-4 py-3 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-sans text-[12px] font-bold tracking-wider text-rose mb-1">
              ¿Quitar de tus favoritos?
            </div>
            <div className="font-mono text-[12px] text-white/65 leading-snug mb-3">
              El activo se eliminará del radar. Puedes volver a añadirlo cuando quieras —
              no perderás historial de análisis.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 rounded-md border border-white/15 bg-transparent px-2 py-1.5 font-mono text-[12px] text-white/75 hover:border-white/35 transition"
              >
                cancelar
              </button>
              <button
                onClick={() => void onConfirmDelete(confirmDeleteId)}
                className="flex-1 rounded-md border border-rose bg-rose/[0.12] px-2 py-1.5 font-mono text-[12px] text-rose hover:bg-rose/[0.18] transition"
              >
                quitar
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-white/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}
