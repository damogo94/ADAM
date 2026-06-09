/**
 * A.D.A.M. — API pública de tipos de la base de datos.
 *
 * El `Database` canónico se genera con `supabase gen types` y vive en
 * `./supabase`. Aquí re-exportamos ese tipo (lo consumen los clients
 * Supabase con `createClient<Database>`) y derivamos alias de dominio
 * estables (Profile, Watchlist, …) para el resto del código.
 *
 * Regenerar tras una migración:
 *   supabase gen types typescript --project-id qaakauberbibfgxthlro > types/db/supabase.ts
 */

import type { Database } from './supabase';

export type { Database, Json } from './supabase';
export { Constants } from './supabase';

// ── Enums ────────────────────────────────────────────────────────────────
export type AssetType = Database['public']['Enums']['asset_type'];
export type SignalLevel = Database['public']['Enums']['signal_level'];
export type Direction = Database['public']['Enums']['direction_t'];
export type ConfidenceLevel = Database['public']['Enums']['confidence_t'];

// ── Filas (Row) por tabla ──────────────────────────────────────────────────
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Watchlist = Database['public']['Tables']['watchlists']['Row'];
export type WatchlistItem = Database['public']['Tables']['watchlist_items']['Row'];
export type SignalHistory = Database['public']['Tables']['signals_history']['Row'];
export type AnalysisLog = Database['public']['Tables']['analyses_log']['Row'];
export type SignalOutcome = Database['public']['Tables']['signal_outcomes']['Row'];
export type TradeOutcome = Database['public']['Tables']['trade_outcomes']['Row'];
export type SignalTradeOutcome = Database['public']['Tables']['signal_trade_outcomes']['Row'];
export type SystemAccess = Database['public']['Tables']['system_access']['Row'];
