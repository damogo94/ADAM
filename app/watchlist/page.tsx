'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { Sparkline } from '@/components/sparkline';
import { cn, fmtPct } from '@/lib/utils';
import type { Watchlist, WatchlistItem, AssetType } from '@/types/db';

interface QuoteState {
  current: number;
  change_pct_24h: number;
  spark7d?: number[];
  loading: boolean;
  error?: string;
}

export default function WatchlistScreen() {
  const router = useRouter();
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTicker, setNewTicker] = useState('');
  const [newAssetType, setNewAssetType] = useState<AssetType>('equity');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/watchlist');
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401) {
          router.push('/login?next=/watchlist');
          return;
        }
        throw new Error(data.detail ?? data.error ?? 'fetch_failed');
      }
      const data = (await r.json()) as { watchlist: Watchlist; items: WatchlistItem[] };
      setWatchlist(data.watchlist);
      setItems(data.items);
      if (data.items.length > 0) void loadQuotesBatch(data.items.map((it) => it.ticker));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }

  async function loadQuotesBatch(tickers: string[]) {
    // Set loading state para todos
    setQuotes((prev) => {
      const next = { ...prev };
      for (const t of tickers) next[t] = { current: 0, change_pct_24h: 0, loading: true };
      return next;
    });
    try {
      const r = await fetch(`/api/market/quotes?symbols=${tickers.map(encodeURIComponent).join(',')}&spark=1`);
      if (!r.ok) throw new Error('batch_quotes_failed');
      const data = (await r.json()) as {
        quotes: { symbol: string; current?: number; change_pct_24h?: number; spark7d?: number[]; error?: string }[];
      };
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of data.quotes) {
          if (q.error || q.current === undefined) {
            next[q.symbol] = { current: 0, change_pct_24h: 0, loading: false, error: q.error ?? 'no_quote' };
          } else {
            next[q.symbol] = {
              current: q.current,
              change_pct_24h: q.change_pct_24h ?? 0,
              spark7d: q.spark7d,
              loading: false,
            };
          }
        }
        return next;
      });
    } catch {
      setQuotes((prev) => {
        const next = { ...prev };
        for (const t of tickers) next[t] = { current: 0, change_pct_24h: 0, loading: false, error: 'no_quote' };
        return next;
      });
    }
  }

  async function loadQuote(ticker: string) {
    // Versión single — usada solo al añadir un nuevo ticker
    return loadQuotesBatch([ticker]);
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
      setItems((prev) => [...prev, data.item]);
      setNewTicker('');
      void loadQuote(data.item.ticker);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(itemId: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    const r = await fetch(`/api/watchlist/${itemId}`, { method: 'DELETE' });
    if (!r.ok) {
      setItems(snapshot);
      setError('No se pudo borrar — reintenta');
    }
  }

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : items.length ? 'ok' : 'offline'} />

      <SectionLabel>watchlist · {watchlist?.name ?? '…'}</SectionLabel>

      <div className="grid grid-cols-2 gap-2 px-4 mb-2">
        <StatBlock label="ACTIVOS" value={String(items.length)} />
        <StatBlock label="SEÑALES" value="0" sub="próximamente" />
      </div>

      <form onSubmit={onAdd} className="px-4 pt-2">
        <div className="flex gap-2">
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

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-rose/35 bg-rose/[0.07] px-3 py-2 font-mono text-[10px] text-rose animate-urg-pulse">
          {error}
        </div>
      )}

      <SectionLabel>activos monitorizados</SectionLabel>
      {loading && items.length === 0 ? (
        <div className="px-4 py-8 text-center font-mono text-[10px] text-slate">cargando watchlist…</div>
      ) : items.length === 0 ? (
        <div className="mx-4 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-8 text-center">
          <div className="text-2xl text-slate-l opacity-15 mb-1">◎</div>
          <div className="font-mono text-[10px] text-slate">
            sin activos · añade tu primer ticker arriba
          </div>
        </div>
      ) : (
        <div className="px-4 space-y-1.5">
          {items.map((it) => (
            <WatchlistRow
              key={it.id}
              item={it}
              quote={quotes[it.ticker]}
              onTap={() => router.push(`/analysis?ticker=${encodeURIComponent(it.ticker)}`)}
              onDelete={() => void onDelete(it.id)}
            />
          ))}
        </div>
      )}

      <footer className="px-5 pt-6 text-center font-mono text-[8px] text-slate opacity-60 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[15px] border border-white/5 bg-surface-2 px-3 py-2.5">
      <div className="font-mono text-[8px] uppercase tracking-wider text-slate mb-0.5">{label}</div>
      <div className="font-orbitron text-[20px] font-black text-white">{value}</div>
      {sub && <div className="font-mono text-[8px] text-slate mt-0.5">{sub}</div>}
    </div>
  );
}

function WatchlistRow({
  item,
  quote,
  onTap,
  onDelete,
}: {
  item: WatchlistItem;
  quote?: QuoteState;
  onTap: () => void;
  onDelete: () => void;
}) {
  const pos = (quote?.change_pct_24h ?? 0) >= 0;
  return (
    <div className="group relative rounded-[15px] border border-white/8 bg-surface-2 hover:border-white/30 transition-all duration-300">
      <button onClick={onTap} className="w-full px-3 py-2.5 flex items-center gap-3 text-left">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="font-orbitron text-[13px] font-bold tracking-wider text-white truncate">
            {item.ticker}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-slate">
            {item.asset_type}
          </div>
        </div>

        {quote?.spark7d && quote.spark7d.length >= 2 && (
          <Sparkline values={quote.spark7d} width={56} height={18} />
        )}

        <div className="flex flex-col items-end gap-0.5">
          {quote?.loading ? (
            <span className="font-mono text-[10px] text-slate">…</span>
          ) : quote?.error ? (
            <span className="font-mono text-[9px] text-slate">no quote</span>
          ) : quote ? (
            <>
              <span className="font-mono text-[13px] font-medium text-white">
                {quote.current.toFixed(2)}
              </span>
              <span className={cn('font-mono text-[10px]', pos ? 'text-emerald' : 'text-rose')}>
                {pos ? '↑ ' : '↓ '}
                {fmtPct(quote.change_pct_24h)}
              </span>
            </>
          ) : (
            <span className="font-mono text-[10px] text-slate">—</span>
          )}
        </div>

        <span className="font-mono text-[16px] text-white opacity-30 group-hover:opacity-100 transition">▶</span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-2 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 rounded font-mono text-[10px] text-rose/70 hover:bg-rose/[0.08] hover:text-rose transition"
        aria-label="Eliminar"
      >
        ×
      </button>
    </div>
  );
}
