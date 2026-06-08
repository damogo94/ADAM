/**
 * A.D.A.M. — Tipos del Watchlist Radar.
 *
 * Frontera: este archivo define el contrato que devuelve
 * `GET /api/watchlist/radar` al cliente, y los tipos intermedios del
 * compute layer. Todo `jsonb` se valida con Zod antes de salir o
 * antes de procesarse aguas abajo — cero `any`, cero `as unknown` sin
 * un Zod parse detrás.
 */

import { z } from 'zod';
import { AssetType as AssetTypeZ } from '@/agents/shared/types';

/** Anomaly type tal como sale de A1. */
export const RadarAnomalyType = z.enum(['anomalia', 'vulnerabilidad', 'oportunidad']);
export type RadarAnomalyType_t = z.infer<typeof RadarAnomalyType>;

/** Direction de A4. */
export const RadarDirection = z.enum(['positivo', 'negativo', 'neutral']);
export type RadarDirection_t = z.infer<typeof RadarDirection>;

/** Confianza categórica de A4. */
export const RadarConfidence = z.enum(['alta', 'media', 'baja']);
export type RadarConfidence_t = z.infer<typeof RadarConfidence>;

/** Signal técnica de A3. */
export const RadarA3Signal = z.enum(['buy', 'sell', 'hold']);
export type RadarA3Signal_t = z.infer<typeof RadarA3Signal>;

/**
 * Subset mínimo de A1Output que el radar necesita. Pasamos `.passthrough()`
 * porque la fila viene de `analyses_log.a1_output` (jsonb) — puede tener
 * más campos que ignoramos. Solo validamos los que vamos a usar.
 */
export const A1FromLog = z
  .object({
    anomaly_detected: z.boolean().optional(),
    anomaly_type: RadarAnomalyType.nullable().optional(),
    anomaly_description: z.string().optional(),
    confidence: z.number().int().min(0).max(100).optional(),
  })
  .passthrough();
export type A1FromLog_t = z.infer<typeof A1FromLog>;

/** Subset mínimo de A3Output. */
export const A3FromLog = z
  .object({
    operativa: z
      .object({
        signal: RadarA3Signal.optional(),
        entrada: z.number().nullable().optional(),
        stop_loss: z.number().nullable().optional(),
        target: z.number().nullable().optional(),
        ratio_riesgo_beneficio: z.number().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type A3FromLog_t = z.infer<typeof A3FromLog>;

/** Subset mínimo de A4Output. */
export const A4FromLog = z
  .object({
    direccion: RadarDirection.optional(),
    confianza: RadarConfidence.optional(),
    accion_sugerida: z.string().optional(),
    riesgo_clave: z.string().optional(),
    confluence: z
      .object({
        score_total_pct: z.number().int().min(0).max(100).optional(),
        nivel_final: RadarConfidence.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type A4FromLog_t = z.infer<typeof A4FromLog>;

/** Fila cruda devuelta por la RPC `get_watchlist_radar`. */
export const RpcRadarRow = z
  .object({
    item_id: z.string().uuid(),
    watchlist_id: z.string().uuid(),
    ticker: z.string().min(1).max(20),
    asset_type: AssetTypeZ,
    position: z.number().int(),
    notes: z.string().nullable(),
    added_at: z.string(),
    // Migración 0008: pin
    is_pinned: z.boolean(),
    pinned_at: z.string().nullable(),
    // jsonb crudo (puede ser null) — validamos por dentro después.
    latest_analysis: z.unknown().nullable(),
    previous_analysis: z.unknown().nullable(),
    latest_unacked_signal: z.unknown().nullable(),
  })
  .strict();
export type RpcRadarRow_t = z.infer<typeof RpcRadarRow>;

/** Snapshot resumido de un análisis para el radar (lo que se serializa al cliente). */
export const RadarAnalysisSnapshot = z
  .object({
    id: z.string().uuid(),
    created_at: z.string(),
    confluence_pct: z.number().int().min(0).max(100),
    direction: RadarDirection,
    confidence: RadarConfidence,
    a3_signal: RadarA3Signal.nullable(),
    a3_entry: z.number().nullable(),
    a3_stop: z.number().nullable(),
    a3_target: z.number().nullable(),
    a3_risk_reward: z.number().nullable(),
    a1_anomaly_detected: z.boolean(),
    a1_anomaly_type: RadarAnomalyType.nullable(),
    a1_anomaly_description: z.string().nullable(),
    /** Una sola frase resumen para la fila ("dictamen titular"). */
    headline: z.string(),
  })
  .strict();
export type RadarAnalysisSnapshot_t = z.infer<typeof RadarAnalysisSnapshot>;

/** Resultado del cálculo de delta entre dos análisis. */
export const RadarDelta = z
  .object({
    /** latest.confluence - previous.confluence. null si no hay previo. */
    confluence_delta_pct: z.number().nullable(),
    /** Cambió la dirección de A4 entre runs. */
    direction_flipped: z.boolean(),
    /** A3 cambió signal entre buy/sell/hold. */
    a3_signal_flipped: z.boolean(),
    /** A1 detectó anomalía NUEVA (no estaba en el run anterior). */
    anomaly_new: z.boolean(),
    /** Había análisis anterior con el que comparar. */
    has_previous: z.boolean(),
  })
  .strict();
export type RadarDelta_t = z.infer<typeof RadarDelta>;

/** Distancia a entrada/stop/target en % vs current_price. */
export const RadarDistances = z
  .object({
    to_entry_pct: z.number().nullable(),
    to_stop_pct: z.number().nullable(),
    to_target_pct: z.number().nullable(),
    risk_reward: z.number().nullable(),
    /** Precio actual está dentro de la zona accionable (±2% de la entrada). */
    actionable: z.boolean(),
  })
  .strict();
export type RadarDistances_t = z.infer<typeof RadarDistances>;

/** Quote ligero para la fila (lo que ya devuelve fallbackQuote). */
export const RadarQuote = z
  .object({
    current: z.number(),
    change_pct_24h: z.number(),
    currency: z.string().optional(),
  })
  .strict();
export type RadarQuote_t = z.infer<typeof RadarQuote>;

/** Señal CMT activa (unacked) — opcional. */
export const RadarSignal = z
  .object({
    id: z.string().uuid(),
    level: z.enum(['urgente', 'atencion', 'monitorear', 'sin_senal']),
    timeframe: z.string(),
    setup_detected: z.string(),
    confidence_pct: z.number().int().min(0).max(100),
    emitted_at: z.string(),
  })
  .strict();
export type RadarSignal_t = z.infer<typeof RadarSignal>;

/** Dirección normalizada de un agente (para los ejes de desacuerdo). */
export const RadarLean = z.enum(['up', 'down', 'flat']);
export type RadarLean_t = z.infer<typeof RadarLean>;

/**
 * Desacuerdo entre agentes — DOS EJES SEPARADOS, nunca fundidos en un escalar
 * (fundirlos rompe el aislamiento de A3 y tira lo que hace especial al sistema):
 *   - narrative: divergencia entre los dos narrativos (A1 ↔ A2).
 *   - technical: (des)alineación del A3 AISLADO vs el consenso narrativo
 *     (A1+A2, NO A4 — A4 ya incluye A3). A3 se mantiene separado también en UI.
 * Con agentes faltantes el eje es 'unavailable' (NUNCA "alineado": el desacuerdo
 * no existe con 2 de 3).
 */
export const RadarDivergence = z
  .object({
    agents_alive: z.object({ a1: z.boolean(), a2: z.boolean(), a3: z.boolean() }).strict(),
    alive_count: z.number().int().min(0).max(3),
    narrative: z
      .object({
        state: z.enum(['aligned', 'divergent', 'mixed', 'unavailable']),
        a1: RadarLean.nullable(),
        a2: RadarLean.nullable(),
        /** Refuerzo del debate cuando existió (0-100). null si no hubo debate. */
        debate_convergence: z.number().nullable(),
      })
      .strict(),
    technical: z
      .object({
        state: z.enum(['aligned', 'divergent', 'neutral', 'unavailable']),
        a3: RadarLean.nullable(),
        narrative_consensus: RadarLean.nullable(),
      })
      .strict(),
  })
  .strict();
export type RadarDivergence_t = z.infer<typeof RadarDivergence>;

/** Fila final del radar — lo que consume el componente UI. */
export const RadarRow = z
  .object({
    item_id: z.string().uuid(),
    ticker: z.string(),
    asset_type: AssetTypeZ,
    position: z.number().int(),
    notes: z.string().nullable(),
    added_at: z.string(),
    is_pinned: z.boolean(),
    pinned_at: z.string().nullable(),
    quote: RadarQuote.nullable(),
    latest: RadarAnalysisSnapshot.nullable(),
    delta: RadarDelta,
    distances: RadarDistances.nullable(),
    signal: RadarSignal.nullable(),
    // Opcional en el contrato (back-compat con mocks/clientes previos); en la
    // práctica buildRow SIEMPRE lo provee. La UI guarda el undefined.
    divergence: RadarDivergence.optional(),
    is_stale: z.boolean(),
    // Reloj 2 de frescura (QW2): % que se ha movido el precio desde el veredicto
    // (initial_price vs quote). null = no calculable. Opcional por back-compat.
    price_drift_pct: z.number().nullable().optional(),
  })
  .strict();
export type RadarRow_t = z.infer<typeof RadarRow>;

/** Una entrada del digest "3 cosas que mirar hoy". */
export const DigestEntry = z
  .object({
    ticker: z.string(),
    /** Origen: `signal` (CMT urgente/atencion unacked) o `delta` (cambio relevante). */
    source: z.enum(['signal', 'delta']),
    /** Razón resumida para el usuario. */
    reason: z.string(),
    /** Severidad: 'high' > 'medium' > 'low'. Ordenación. */
    severity: z.enum(['high', 'medium', 'low']),
  })
  .strict();
export type DigestEntry_t = z.infer<typeof DigestEntry>;

/** Respuesta completa del endpoint /api/watchlist/radar. */
export const RadarResponse = z
  .object({
    rows: z.array(RadarRow),
    digest: z.array(DigestEntry).max(3),
    /** Timestamp de cuando se construyó esta respuesta (server-side). */
    generated_at: z.string(),
  })
  .strict();
export type RadarResponse_t = z.infer<typeof RadarResponse>;
