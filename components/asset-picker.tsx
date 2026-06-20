'use client';

import { useEffect, useMemo, useState } from 'react';
import { CATALOG, type CatalogAsset } from '@/lib/catalog/assets';
import { CATEGORIES, type Category } from '@/lib/catalog/categories';
import { useFavorites } from '@/hooks/use-favorites';
import { useQuotes } from '@/hooks/use-quotes';
import { cn, fmtPct } from '@/lib/utils';

interface AssetPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (ticker: string) => void;
}

type TabId = Category | 'all' | 'favorites';

/**
 * Bottom-sheet con catálogo curado de activos, agrupado por categoría.
 *
 * PR2: favoritos atados a /api/watchlist vía `useFavorites`. Decisión
 * (sesión 7a): favorito = item de watchlist por defecto, un solo
 * concepto persistente, sin tabla nueva.
 */
export function AssetPicker({ open, onClose, onSelect }: AssetPickerProps) {
  const [tab, setTab] = useState<TabId>('all');
  const [query, setQuery] = useState('');
  // Lazy: sólo carga la watchlist cuando el picker se abre por primera vez.
  const favorites = useFavorites(open);

  // Reset tab y query al cerrar para que la próxima apertura sea limpia.
  // No reseteamos los favoritos — quedan cacheados durante la sesión.
  useEffect(() => {
    if (!open) {
      setTab('all');
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(
    () => filterCatalog(CATALOG, tab, query, favorites.isFavorite),
    [tab, query, favorites.isFavorite]
  );

  // Cap visibles para quotes — más allá de 40 el batching pega 2+ requests
  // al endpoint cada vez que el user navega y no aporta valor (los tiles
  // de abajo ni se ven sin scroll).
  const quotedSymbols = useMemo(
    () => filtered.slice(0, 40).map((a) => a.ticker),
    [filtered]
  );
  const quotes = useQuotes(quotedSymbols, open);

  if (!open) return null;

  const showFavToggle = favorites.authed;
  const isEmptyFavTab = tab === 'favorites' && filtered.length === 0 && !query;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Selector de activos"
    >
      <button
        type="button"
        aria-label="Cerrar selector"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
      />

      <div
        className={cn(
          'relative w-full max-w-md md:max-w-2xl lg:max-w-3xl',
          'max-h-[85vh] md:max-h-[80vh] flex flex-col',
          'rounded-t-[20px] md:rounded-[20px] border border-white/15 bg-surface-2',
          'overflow-hidden shadow-2xl'
        )}
      >
        <div className="absolute inset-x-[10%] top-px h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        <div className="shrink-0 px-4 pt-2 pb-3 border-b border-white/8">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-white/65">
              ▸ catálogo · selecciona un activo
            </p>
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-[14px] text-white/66 hover:text-white transition"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="buscar (AAPL · oro · btc…)"
            className={cn(
              'w-full rounded-[11px] border border-white/10 bg-black/40 px-3 py-2',
              'font-mono text-[12px] text-white caret-white outline-none transition-[border-color]',
              'placeholder:text-white/45',
              'focus:border-white/40'
            )}
            autoFocus
          />
          {favorites.error && (
            <div className="mt-2 font-mono text-[12px] text-rose">
              ⚠ no se pudo sincronizar favoritos — reintenta
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-white/8">
          {showFavToggle && (
            <TabChip id="favorites" current={tab} onSelect={setTab} label="favoritos" glyph="★" />
          )}
          <TabChip id="all" current={tab} onSelect={setTab} label="todos" glyph="∗" />
          {CATEGORIES.map((c) => (
            <TabChip
              key={c.id}
              id={c.id}
              current={tab}
              onSelect={setTab}
              label={c.label}
              glyph={c.glyph}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isEmptyFavTab ? (
            <FavEmptyState />
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center font-mono text-[12px] text-slate">
              sin resultados
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {filtered.map((asset) => {
                const q = quotes.get(asset.ticker.toUpperCase());
                return (
                  <AssetTile
                    key={asset.ticker}
                    asset={asset}
                    fav={favorites.isFavorite(asset.ticker)}
                    showFavToggle={showFavToggle}
                    changePct={
                      q && typeof q.change_pct_24h === 'number' ? q.change_pct_24h : undefined
                    }
                    onSelect={() => {
                      onSelect(asset.ticker);
                      onClose();
                    }}
                    onToggleFav={() => void favorites.toggle(asset)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function filterCatalog(
  catalog: CatalogAsset[],
  tab: TabId,
  query: string,
  isFavorite: (ticker: string) => boolean
): CatalogAsset[] {
  const q = query.trim().toUpperCase();

  const matchesQuery = (a: CatalogAsset): boolean => {
    if (!q) return true;
    if (a.ticker.toUpperCase().includes(q)) return true;
    if (a.label.toUpperCase().includes(q)) return true;
    if (a.aliases?.some((al) => al.toUpperCase().includes(q))) return true;
    return false;
  };

  if (tab === 'favorites') {
    return catalog.filter((a) => isFavorite(a.ticker) && matchesQuery(a));
  }

  const filtered = catalog.filter((a) => {
    if (tab !== 'all' && a.category !== tab) return false;
    return matchesQuery(a);
  });

  // En "todos" sin búsqueda activa, ordena favoritos primero
  // manteniendo el orden curado dentro de cada bloque.
  if (tab === 'all' && !q) {
    const favs: CatalogAsset[] = [];
    const rest: CatalogAsset[] = [];
    for (const a of filtered) (isFavorite(a.ticker) ? favs : rest).push(a);
    return [...favs, ...rest];
  }
  return filtered;
}

function TabChip({
  id,
  current,
  onSelect,
  label,
  glyph,
}: {
  id: TabId;
  current: TabId;
  onSelect: (id: TabId) => void;
  label: string;
  glyph: string;
}) {
  const active = current === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        'flex-shrink-0 rounded-full border px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.08em] transition-all',
        active
          ? 'border-white bg-white text-black'
          : 'border-white/15 bg-white/[0.03] text-white/65 hover:border-white/35 hover:text-white'
      )}
    >
      <span className="mr-1 opacity-70">{glyph}</span>
      {label}
    </button>
  );
}

function AssetTile({
  asset,
  fav,
  showFavToggle,
  changePct,
  onSelect,
  onToggleFav,
}: {
  asset: CatalogAsset;
  fav: boolean;
  showFavToggle: boolean;
  changePct: number | undefined;
  onSelect: () => void;
  onToggleFav: () => void;
}) {
  const pos = changePct !== undefined && changePct >= 0;
  return (
    <div
      className={cn(
        'group relative rounded-[12px] border bg-black/30 transition-all',
        fav
          ? 'border-white/30 bg-black/50'
          : 'border-white/8 hover:border-white/35 hover:bg-black/50'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full px-2.5 py-2 text-left active:scale-[0.98] transition-transform"
      >
        <div className="font-mono text-[13px] font-bold tracking-[0.08em] text-white truncate pr-5">
          {asset.ticker}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <div className="font-mono text-[12px] text-white/66 truncate">
            {asset.label}
          </div>
          {changePct !== undefined && (
            <span
              className={cn(
                'font-mono text-[12px] tabular-nums flex-shrink-0',
                pos ? 'text-emerald' : 'text-rose'
              )}
            >
              {fmtPct(changePct, 1)}
            </span>
          )}
        </div>
      </button>
      {showFavToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          className={cn(
            'absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full',
            'font-mono text-[12px] transition-all',
            fav
              ? 'text-white'
              : 'text-white/25 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100'
          )}
          aria-label={fav ? `Quitar ${asset.ticker} de favoritos` : `Añadir ${asset.ticker} a favoritos`}
          aria-pressed={fav}
        >
          {fav ? '★' : '☆'}
        </button>
      )}
    </div>
  );
}

function FavEmptyState() {
  return (
    <div className="px-3 py-8 text-center">
      <div className="text-2xl text-white/15 mb-2">★</div>
      <div className="font-mono text-[12px] text-slate leading-relaxed">
        sin favoritos · pulsa la estrella en cualquier activo
        <br />
        para guardarlo aquí y en tu watchlist
      </div>
    </div>
  );
}
