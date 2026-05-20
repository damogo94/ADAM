'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogAsset } from '@/lib/catalog/assets';
import type { WatchlistItem } from '@/types/db';

/**
 * Hook de favoritos para el AssetPicker.
 *
 * Decisión clave (sesión 7a, validada por owner): favorito = item de la
 * watchlist por defecto. Un solo concepto persistente, sin tabla nueva.
 * Esto significa que:
 *   - "Estrella en el picker" y "estoy en /watchlist" son la misma cosa.
 *   - La diferencia entre /watchlist y picker es la VISTA, no el DATO.
 *
 * Auth: si el user no está logueado, GET /api/watchlist devuelve 401.
 * En ese caso degradamos gracioso — `authed = false`, sin star toggle.
 */

interface State {
  loading: boolean;
  authed: boolean;
  /** ticker (upper) → item.id de watchlist, necesario para DELETE. */
  byTicker: Map<string, string>;
  error: string | null;
}

const INITIAL: State = {
  loading: true,
  authed: true,
  byTicker: new Map(),
  error: null,
};

export interface UseFavoritesResult {
  loading: boolean;
  authed: boolean;
  error: string | null;
  isFavorite: (ticker: string) => boolean;
  toggle: (asset: CatalogAsset) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * @param enabled — si false, el hook no hace fetch. Útil para no cargar
 * la watchlist hasta que el picker se abra por primera vez.
 */
export function useFavorites(enabled: boolean): UseFavoritesResult {
  const [state, setState] = useState<State>(INITIAL);
  const fetchedOnceRef = useRef(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch('/api/watchlist');
      if (r.status === 401) {
        setState({ loading: false, authed: false, byTicker: new Map(), error: null });
        return;
      }
      if (!r.ok) throw new Error('fetch_failed');
      const data = (await r.json()) as { items: WatchlistItem[] };
      const map = new Map<string, string>();
      for (const it of data.items) map.set(it.ticker.toUpperCase(), it.id);
      setState({ loading: false, authed: true, byTicker: map, error: null });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'unknown',
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled || fetchedOnceRef.current) return;
    fetchedOnceRef.current = true;
    void load();
  }, [enabled, load]);

  const isFavorite = useCallback(
    (ticker: string) => state.byTicker.has(ticker.toUpperCase()),
    [state.byTicker]
  );

  const toggle = useCallback(
    async (asset: CatalogAsset) => {
      const key = asset.ticker.toUpperCase();
      const existingId = state.byTicker.get(key);

      if (existingId) {
        // DELETE — optimistic
        const snapshot = state.byTicker;
        setState((s) => {
          const next = new Map(s.byTicker);
          next.delete(key);
          return { ...s, byTicker: next, error: null };
        });
        try {
          const r = await fetch(`/api/watchlist/${existingId}`, { method: 'DELETE' });
          if (!r.ok) throw new Error('delete_failed');
        } catch (e) {
          // rollback
          setState((s) => ({
            ...s,
            byTicker: snapshot,
            error: e instanceof Error ? e.message : 'delete_failed',
          }));
        }
      } else {
        // POST — optimistic con id placeholder; reemplaza con id real al resolver.
        const tempId = `tmp-${key}`;
        const snapshot = state.byTicker;
        setState((s) => {
          const next = new Map(s.byTicker);
          next.set(key, tempId);
          return { ...s, byTicker: next, error: null };
        });
        try {
          const r = await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: asset.ticker, asset_type: asset.asset_type }),
          });
          if (r.status === 409) {
            // Ya estaba en BD (carrera o estado inconsistente). Re-cargamos.
            await load();
            return;
          }
          if (!r.ok) throw new Error('add_failed');
          const data = (await r.json()) as { item: WatchlistItem };
          setState((s) => {
            const next = new Map(s.byTicker);
            next.set(key, data.item.id);
            return { ...s, byTicker: next };
          });
        } catch (e) {
          setState((s) => ({
            ...s,
            byTicker: snapshot,
            error: e instanceof Error ? e.message : 'add_failed',
          }));
        }
      }
    },
    [state.byTicker, load]
  );

  return {
    loading: state.loading,
    authed: state.authed,
    error: state.error,
    isFavorite,
    toggle,
    refresh: load,
  };
}
