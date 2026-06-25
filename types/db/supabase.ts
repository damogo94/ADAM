/**
 * A.D.A.M. — Tipos generados de Supabase.
 *
 * GENERADO. No editar a mano. Regenerar con:
 *   supabase gen types typescript --project-id qaakauberbibfgxthlro > types/db/supabase.ts
 *
 * Los alias de dominio (Profile, Watchlist, AnalysisLog, …) viven en
 * `types/db/index.ts` y se derivan de estos tipos para mantener estable
 * la API pública del módulo.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      a2_cache: {
        Row: {
          cached_at: string
          macro_as_of: string
          output: Json
          ticker: string
        }
        Insert: {
          cached_at?: string
          macro_as_of: string
          output: Json
          ticker: string
        }
        Update: {
          cached_at?: string
          macro_as_of?: string
          output?: Json
          ticker?: string
        }
        Relationships: []
      }
      analyses_log: {
        Row: {
          a1_output: Json | null
          a2_output: Json | null
          a3_output: Json | null
          a4_output: Json
          actionable_pct: number | null
          confidence: Database["public"]["Enums"]["confidence_t"]
          confluence_pct: number
          created_at: string
          debate_output: Json | null
          direction: Database["public"]["Enums"]["direction_t"]
          id: string
          initial_price: number | null
          initial_price_at: string | null
          kappa: number | null
          latency_ms: number | null
          net_pct: number | null
          ticker: string
          tokens_used: number | null
          usage_breakdown: Json | null
          user_id: string
        }
        Insert: {
          a1_output?: Json | null
          a2_output?: Json | null
          a3_output?: Json | null
          a4_output: Json
          actionable_pct?: number | null
          confidence: Database["public"]["Enums"]["confidence_t"]
          confluence_pct: number
          created_at?: string
          debate_output?: Json | null
          direction: Database["public"]["Enums"]["direction_t"]
          id?: string
          initial_price?: number | null
          initial_price_at?: string | null
          kappa?: number | null
          latency_ms?: number | null
          net_pct?: number | null
          ticker: string
          tokens_used?: number | null
          usage_breakdown?: Json | null
          user_id: string
        }
        Update: {
          a1_output?: Json | null
          a2_output?: Json | null
          a3_output?: Json | null
          a4_output?: Json
          actionable_pct?: number | null
          confidence?: Database["public"]["Enums"]["confidence_t"]
          confluence_pct?: number
          created_at?: string
          debate_output?: Json | null
          direction?: Database["public"]["Enums"]["direction_t"]
          id?: string
          initial_price?: number | null
          initial_price_at?: string | null
          kappa?: number | null
          latency_ms?: number | null
          net_pct?: number | null
          ticker?: string
          tokens_used?: number | null
          usage_breakdown?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      macro_snapshots_cache: {
        Row: {
          as_of: string
          fetched_at: string
          payload: Json
        }
        Insert: {
          as_of: string
          fetched_at?: string
          payload: Json
        }
        Update: {
          as_of?: string
          fetched_at?: string
          payload?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      signal_outcomes: {
        Row: {
          analysis_id: string
          eval_price: number
          evaluated_at: string
          hit: boolean
          horizon_days: number
          return_pct: number
        }
        Insert: {
          analysis_id: string
          eval_price: number
          evaluated_at?: string
          hit: boolean
          horizon_days: number
          return_pct: number
        }
        Update: {
          analysis_id?: string
          eval_price?: number
          evaluated_at?: string
          hit?: boolean
          horizon_days?: number
          return_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "signal_outcomes_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses_log"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_trade_outcomes: {
        Row: {
          direction: string | null
          entry: number | null
          entry_type: string | null
          evaluated_at: string
          exit_price: number | null
          outcome: string
          r_multiple: number | null
          resolved_days: number | null
          return_pct: number | null
          signal_id: string
          stop_loss: number | null
          target: number | null
          timeframe: string | null
        }
        Insert: {
          direction?: string | null
          entry?: number | null
          entry_type?: string | null
          evaluated_at?: string
          exit_price?: number | null
          outcome: string
          r_multiple?: number | null
          resolved_days?: number | null
          return_pct?: number | null
          signal_id: string
          stop_loss?: number | null
          target?: number | null
          timeframe?: string | null
        }
        Update: {
          direction?: string | null
          entry?: number | null
          entry_type?: string | null
          evaluated_at?: string
          exit_price?: number | null
          outcome?: string
          r_multiple?: number | null
          resolved_days?: number | null
          return_pct?: number | null
          signal_id?: string
          stop_loss?: number | null
          target?: number | null
          timeframe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_trade_outcomes_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: true
            referencedRelation: "signals_history"
            referencedColumns: ["id"]
          },
        ]
      }
      signals_history: {
        Row: {
          acknowledged_at: string | null
          confidence_pct: number
          emitted_at: string
          entry_price: number | null
          id: string
          indicators: Json
          invalidation_factor: string
          level: Database["public"]["Enums"]["signal_level"]
          risk_reward_ratio: number | null
          setup_detected: string
          stop_loss: number | null
          target_price: number | null
          ticker: string
          timeframe: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          confidence_pct: number
          emitted_at?: string
          entry_price?: number | null
          id?: string
          indicators?: Json
          invalidation_factor: string
          level: Database["public"]["Enums"]["signal_level"]
          risk_reward_ratio?: number | null
          setup_detected: string
          stop_loss?: number | null
          target_price?: number | null
          ticker: string
          timeframe: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          confidence_pct?: number
          emitted_at?: string
          entry_price?: number | null
          id?: string
          indicators?: Json
          invalidation_factor?: string
          level?: Database["public"]["Enums"]["signal_level"]
          risk_reward_ratio?: number | null
          setup_detected?: string
          stop_loss?: number | null
          target_price?: number | null
          ticker?: string
          timeframe?: string
          user_id?: string
        }
        Relationships: []
      }
      system_access: {
        Row: {
          created_at: string
          email: string
          note: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trade_outcomes: {
        Row: {
          analysis_id: string
          direction: string
          entry: number | null
          entry_type: string
          evaluated_at: string
          exit_price: number | null
          horizonte: string
          outcome: string
          r_multiple: number | null
          rb_ratio: number | null
          resolved_days: number | null
          return_pct: number | null
          stop_loss: number | null
          target: number | null
        }
        Insert: {
          analysis_id: string
          direction: string
          entry?: number | null
          entry_type: string
          evaluated_at?: string
          exit_price?: number | null
          horizonte: string
          outcome: string
          r_multiple?: number | null
          rb_ratio?: number | null
          resolved_days?: number | null
          return_pct?: number | null
          stop_loss?: number | null
          target?: number | null
        }
        Update: {
          analysis_id?: string
          direction?: string
          entry?: number | null
          entry_type?: string
          evaluated_at?: string
          exit_price?: number | null
          horizonte?: string
          outcome?: string
          r_multiple?: number | null
          rb_ratio?: number | null
          resolved_days?: number | null
          return_pct?: number | null
          stop_loss?: number | null
          target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_outcomes_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "analyses_log"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          added_at: string
          asset_type: Database["public"]["Enums"]["asset_type"]
          id: string
          is_pinned: boolean
          notes: string | null
          pinned_at: string | null
          position: number
          ticker: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          asset_type?: Database["public"]["Enums"]["asset_type"]
          id?: string
          is_pinned?: boolean
          notes?: string | null
          pinned_at?: string | null
          position?: number
          ticker: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          asset_type?: Database["public"]["Enums"]["asset_type"]
          id?: string
          is_pinned?: boolean
          notes?: string | null
          pinned_at?: string | null
          position?: number
          ticker?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_activity: { Args: { target_user: string }; Returns: Json }
      get_users_overview: {
        Args: never
        Returns: {
          analyses_count: number
          display_name: string
          distinct_tickers: number
          email: string
          last_analysis_at: string
          registered_at: string
          signals_count: number
          user_id: string
        }[]
      }
      get_watchlist_radar: {
        Args: never
        Returns: {
          added_at: string
          asset_type: Database["public"]["Enums"]["asset_type"]
          is_pinned: boolean
          item_id: string
          latest_analysis: Json
          latest_unacked_signal: Json
          notes: string
          pinned_at: string
          position: number
          previous_analysis: Json
          ticker: string
          watchlist_id: string
        }[]
      }
      is_system_authorized: { Args: never; Returns: boolean }
    }
    Enums: {
      asset_type: "equity" | "etf" | "crypto" | "forex" | "commodity" | "bond"
      confidence_t: "alta" | "media" | "baja"
      direction_t: "positivo" | "negativo" | "neutral"
      signal_level: "urgente" | "atencion" | "monitorear" | "sin_senal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      asset_type: ["equity", "etf", "crypto", "forex", "commodity", "bond"],
      confidence_t: ["alta", "media", "baja"],
      direction_t: ["positivo", "negativo", "neutral"],
      signal_level: ["urgente", "atencion", "monitorear", "sin_senal"],
    },
  },
} as const
