/**
 * A.D.A.M. — Tipos de la base de datos Supabase.
 *
 * Esto refleja `supabase/migrations/0001_init.sql` a mano. En cuanto el proyecto
 * Supabase est&eacute; creado, sustituir por la salida de:
 *
 *   supabase gen types typescript --project-id YOUR_REF > types/db/supabase.ts
 *
 * Y reexportar desde aqu&iacute; para mantener la API estable.
 */

export type AssetType = 'equity' | 'etf' | 'crypto' | 'forex' | 'commodity' | 'bond';
export type SignalLevel = 'urgente' | 'atencion' | 'monitorear' | 'sin_senal';
export type Direction = 'positivo' | 'negativo' | 'neutral';
export type ConfidenceLevel = 'alta' | 'media' | 'baja';

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  ticker: string;
  asset_type: AssetType;
  position: number;
  notes: string | null;
  added_at: string;
}

export interface SignalHistory {
  id: string;
  user_id: string;
  ticker: string;
  level: SignalLevel;
  timeframe: string;
  setup_detected: string;
  confidence_pct: number;
  entry_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
  risk_reward_ratio: number | null;
  invalidation_factor: string;
  indicators: Record<string, unknown>;
  emitted_at: string;
  acknowledged_at: string | null;
}

export interface AnalysisLog {
  id: string;
  user_id: string;
  ticker: string;
  confluence_pct: number;
  direction: Direction;
  confidence: ConfidenceLevel;
  a1_output: Record<string, unknown>;
  a2_output: Record<string, unknown>;
  a3_output: Record<string, unknown>;
  debate_output: Record<string, unknown> | null;
  a4_output: Record<string, unknown>;
  latency_ms: number | null;
  tokens_used: number | null;
  created_at: string;
}

/**
 * Database schema typed por tabla — coincide con lo que devuelve `@supabase/supabase-js`.
 * Usar con `createClient<Database>(...)` para type-safety en queries.
 *
 * Shape compatible con `GenericSchema` de @supabase/supabase-js: Tables + Views +
 * Functions + Enums. Si en el futuro generamos via `supabase gen types`, podemos
 * sustituir este archivo y conservar la firma pública.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Pick<Profile, 'id'> & Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: [];
      };
      watchlists: {
        Row: Watchlist;
        Insert: Pick<Watchlist, 'user_id' | 'name'> &
          Partial<Omit<Watchlist, 'user_id' | 'name' | 'id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<Watchlist, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
      watchlist_items: {
        Row: WatchlistItem;
        Insert: Pick<WatchlistItem, 'watchlist_id' | 'ticker'> &
          Partial<Omit<WatchlistItem, 'watchlist_id' | 'ticker' | 'id' | 'added_at'>>;
        Update: Partial<Omit<WatchlistItem, 'id' | 'watchlist_id' | 'added_at'>>;
        Relationships: [];
      };
      signals_history: {
        Row: SignalHistory;
        Insert: Omit<SignalHistory, 'id' | 'emitted_at' | 'acknowledged_at'> &
          Partial<Pick<SignalHistory, 'acknowledged_at'>>;
        Update: Partial<Omit<SignalHistory, 'id' | 'user_id' | 'emitted_at'>>;
        Relationships: [];
      };
      analyses_log: {
        Row: AnalysisLog;
        Insert: Omit<AnalysisLog, 'id' | 'created_at'>;
        Update: Partial<Omit<AnalysisLog, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      asset_type: AssetType;
      signal_level: SignalLevel;
      direction_t: Direction;
      confidence_t: ConfidenceLevel;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
