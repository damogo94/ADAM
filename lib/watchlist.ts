import 'server-only';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { Watchlist, WatchlistItem } from '@/types/db';

/**
 * Devuelve la watchlist default del usuario. Si no tiene, la crea.
 * Idempotente — siempre devuelve un id válido en watchlists.
 */
export async function getOrCreateDefaultWatchlist(userId: string): Promise<Watchlist> {
  const supabase = await createSupabaseServer();

  // Buscar default existente
  const { data: existing } = await supabase
    .from('watchlists')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (existing) return existing as Watchlist;

  // No existe — crear
  const { data: created, error } = await supabase
    .from('watchlists')
    .insert({ user_id: userId, name: 'Mi Watchlist', is_default: true })
    .select('*')
    .single();

  if (error || !created) {
    throw new Error(`No se pudo crear watchlist default: ${error?.message ?? 'unknown'}`);
  }
  return created as Watchlist;
}

/**
 * Devuelve los items de la watchlist con su precio actual (si está disponible).
 * No bloquea si el quote falla — devuelve el item sin price.
 */
export async function getWatchlistItems(watchlistId: string): Promise<WatchlistItem[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('*')
    .eq('watchlist_id', watchlistId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as WatchlistItem[];
}
