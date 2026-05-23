'use client';

/**
 * Watchlist · "radar de atención" (feature/watchlist-radar).
 *
 * Cambia de mostrar "ticker + precio" a un radar accionable:
 *   - Cabecera "3 cosas que mirar hoy" (digest server-side).
 *   - Por fila: dictamen + delta + distancia a la acción + frescura +
 *     badge de anomalía + signal CMT activa.
 *
 * Datos REALES desde GET /api/watchlist/radar (un solo round-trip a la
 * RPC `get_watchlist_radar` + quotes paralelos server-side).
 *
 * Cero cambios en lógica de agentes ni en /api/agents/*.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { AssetPicker } from '@/components/asset-picker';
import { RadarRow } from '@/components/watchlist/radar-row';
import { DigestHeader } from '@/components/watchlist/digest-header';
import { LensToggle } from '@/components/lens/lens-toggle';
import { cn } from '@/lib/utils';
import { RadarResponse, type RadarResponse_t } from '@/lib/radar/types';
import type { AssetType } from '@/types/db';

export default function WatchlistScreen() {
  const router = useRouter();
  const [radar, setRadar] = useState<RadarResponse_t | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTicker, setNewTicker] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetType>('equity');
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/watchlist/radar');
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/watchlist');
          return;
        }
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail ?? j.error ?? 'fetch_failed');
      }
      const data = await r.json();
      const parsed = RadarResponse.safeParse(data);
      if (!parsed.success) {
        // eslint-disable-next-line no-console
        console.warn('[watchlist/radar] respuesta no valida', parsed.error.issues.slice(0, 3));
        throw new Error('respuesta de radar inválida');
      }
      setRadar(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setLoading(false);
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
      // Re-fetch radar entero — la nueva fila aún no tiene análisis ni quote
      // cargado en el server-side, pero esto trae al menos el item.
      await load();
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(itemId: string) {
    // Optimistic delete sobre el array local de radar.rows
    const prevRadar = radar;
    setRadar((cur) => (cur ? { ...cur, rows: cur.rows.filter((r) => r.item_id !== itemId) } : cur));
    const r = await fetch(`/api/watchlist/${itemId}`, { method: 'DELETE' });
    if (!r.ok) {
      setRadar(prevRadar);
      setError('No se pudo borrar — reintenta');
    }
  }

  const onDigestSelect = useCallback((ticker: string) => {
    setHighlight(ticker);
    const el = rowRefs.current.get(ticker);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Quitar highlight a los pocos segundos
    window.setTimeout(() => setHighlight((cur) => (cur === ticker ? null : cur)), 3500);
  }, []);

  const rows = radar?.rows ?? [];
  const digest = radar?.digest ?? [];
  const generatedAt = radar?.generated_at;

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : rows.length ? 'ok' : 'offline'} />

      {/* Toggle prosumer/educativo + Digest */}
      <div className="mx-4 mt-2 flex items-center justify-between">
        <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/35">
          radar
        </span>
        <LensToggle />
      </div>
      <div className="mt-2" />
      <DigestHeader entries={digest} onSelect={onDigestSelect} generatedAt={generatedAt} />

      {/* Form alta — sin tocar (botón catálogo + input + select + +) */}
      <form onSubmit={onAdd} className="px-4 pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={adding}
            className={cn(
              'flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04]',
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
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] uppercase text-white placeholder-white/25 focus:border-white/40 focus:outline-none"
          />
          <select
            value={newAssetType}
            onChange={(e) => setNewAssetType(e.target.value as AssetType)}
            className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 font-mono text-[10px] text-white focus:border-white/40 focus:outline-none"
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
            className="rounded-lg border border-white bg-white px-3 py-2 font-orbitron text-[10px] font-bold tracking-[0.12em] text-black transition hover:bg-white/85 disabled:opacity-40 disabled:cursor-not-allowed"
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
        <div className="mx-4 mt-3 rounded-lg border border-rose/35 bg-rose/[0.07] px-3 py-2 font-mono text-[10px] text-rose animate-urg-pulse">
          {error}
        </div>
      )}

      <SectionLabel>activos en radar · {rows.length}</SectionLabel>
      {loading && rows.length === 0 ? (
        <div className="px-4 py-8 text-center font-mono text-[10px] text-slate">cargando radar…</div>
      ) : rows.length === 0 ? (
        <div className="mx-4 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-8 text-center">
          <div className="text-2xl text-slate-l opacity-15 mb-1">◎</div>
          <div className="font-mono text-[10px] text-slate">
            sin activos · añade tu primer ticker arriba
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
                highlighted={highlight === row.ticker}
                onAnalyze={() =>
                  router.push(`/analysis?ticker=${encodeURIComponent(row.ticker)}`)
                }
                onDelete={() => void onDelete(row.item_id)}
              />
            </div>
          ))}
        </div>
      )}

      <footer className="px-5 pt-6 text-center font-mono text-[8px] text-slate opacity-60 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}
