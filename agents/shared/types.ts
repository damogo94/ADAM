/**
 * A.D.A.M. — Schemas Zod compartidos
 *
 * Refactor Fase 1 · Tarea 1.1
 *
 * Este archivo es la **fuente de verdad** de los contratos de salida de los
 * agentes y los enums transversales. Reemplaza progresivamente los schemas
 * individuales en `agents/{a1,a2,a3,a4}/schema.ts`. Durante la migración,
 * ambos pueden coexistir; la regla es: código NUEVO importa de aquí, código
 * VIEJO se migra cuando se toque.
 *
 * Convenciones:
 *   - Todos los outputs usan `.strict()` para rechazar campos extra que el
 *     LLM pudiera inventar fuera del contrato.
 *   - Enums se exportan como Zod (para .parse()) y como tipos inferidos (TS).
 *   - Los campos `narrative` aquí declaran su cap pero NO `.min()` — la
 *     longitud mínima la valida el agente (algunos pueden venir vacíos en
 *     edge cases donde el snapshot es insuficiente).
 *
 * NO contiene aquí: schemas de input crudo (OHLCVCandle, MarketSnapshot)
 * porque viven en su data layer correspondiente. Sí incluye los outputs de
 * los agentes y el output computado de confluence.
 */

import { z } from 'zod';

// ───────────────────────────────────────────────────────────────────────────
// 1. Enums compartidos
// ───────────────────────────────────────────────────────────────────────────

/**
 * Currency codes ISO-4217 + stablecoins comunes. Ampliar bajo demanda real:
 * añadir un código NUEVO solo cuando un activo concreto lo requiera. No
 * inflar preventivamente — el enum se usa para validar entrada del LLM, y
 * cuanto más estrecho, mejor rechaza basura.
 */
export const Currency = z.enum([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'HKD',
  'USDT', 'USDC',
]);
export type Currency_t = z.infer<typeof Currency>;

export const AssetType = z.enum([
  'equity',
  'etf',
  'crypto',
  'forex',
  'commodity',
  'bond',
]);
export type AssetType_t = z.infer<typeof AssetType>;

/** Dirección agregada que emite A4 al usuario. */
export const Direction = z.enum(['positivo', 'negativo', 'neutral']);
export type Direction_t = z.infer<typeof Direction>;

/** Nivel de confianza categórico. Convención: 0-33=baja, 34-66=media, 67-100=alta. */
export const Confidence = z.enum(['alta', 'media', 'baja']);
export type Confidence_t = z.infer<typeof Confidence>;

/** Señal operativa de A3. */
export const Signal = z.enum(['buy', 'sell', 'hold']);
export type Signal_t = z.infer<typeof Signal>;

/** Sentimiento de una pieza de news (lo emite el clasificador heurístico o el LLM). */
export const NewsSentiment = z.enum(['bullish', 'bearish', 'neutral']);
export type NewsSentiment_t = z.infer<typeof NewsSentiment>;

/** Tendencia primaria/secundaria en price action. */
export const TrendDirection = z.enum(['alcista', 'bajista', 'lateral']);
export type TrendDirection_t = z.infer<typeof TrendDirection>;

/** Estado de volumen — usado por A3. */
export const VolumeState = z.enum([
  'creciente',
  'estable',
  'decreciente',
  'divergencia_alcista',
  'divergencia_bajista',
]);
export type VolumeState_t = z.infer<typeof VolumeState>;

/** Horizonte operativo. */
export const TradingHorizon = z.enum(['intradia', 'swing', 'posicional']);
export type TradingHorizon_t = z.infer<typeof TradingHorizon>;

// ───────────────────────────────────────────────────────────────────────────
// 2. A1 Output — Activo · Micro
// ───────────────────────────────────────────────────────────────────────────

export const A1Output = z
  .object({
    ticker: z.string().min(1).max(20),
    asset_type: AssetType,
    price: z
      .object({
        current: z.number(),
        change_pct_24h: z.number(),
        change_pct_7d: z.number(),
        currency: Currency,
      })
      .strict(),
    fundamentals: z
      .object({
        per: z.number().nullable(),
        peg: z.number().nullable(),
        ev_ebitda: z.number().nullable(),
        fcf_yield_pct: z.number().nullable(),
        dividend_yield_pct: z.number().nullable(),
        market_cap_usd: z.number().nullable(),
      })
      .strict(),
    news: z
      .array(
        z
          .object({
            headline: z.string(),
            source: z.string(),
            sentiment: NewsSentiment,
            relevance: z.number().int().min(1).max(5),
          })
          .strict()
      )
      .max(10),
    anomaly_detected: z.boolean(),
    anomaly_type: z
      .enum(['anomalia', 'vulnerabilidad', 'oportunidad'])
      .nullable(),
    anomaly_description: z.string().max(1500),
    confidence: z.number().int().min(0).max(100),
    narrative: z.string().max(2500),
  })
  .strict();
export type A1Output_t = z.infer<typeof A1Output>;

// ───────────────────────────────────────────────────────────────────────────
// 3. A2 Output — Macro
// ───────────────────────────────────────────────────────────────────────────

export const A2Output = z
  .object({
    ticker: z.string().min(1).max(20),
    macro_context: z
      .object({
        ciclo_economico: z.enum([
          'expansion',
          'pico',
          'contraccion',
          'recuperacion',
        ]),
        regimen_tipos: z.enum(['subida', 'pausa', 'bajada']),
        inflacion_trend: z.enum(['subiendo', 'estable', 'bajando']),
        fed_funds_rate_pct: z.number().nullable(),
        us_10y_yield_pct: z.number().nullable(),
        narrative: z.string().max(2500),
      })
      .strict(),
    factores_clave: z
      .array(
        z
          .object({
            factor: z.string(),
            impacto: z.enum(['positivo', 'negativo', 'neutral']),
            magnitud: z.number().int().min(1).max(5),
          })
          .strict()
      )
      .max(8),
    correlaciones: z
      .array(
        z
          .object({
            activo: z.string(),
            correlacion: z.number().min(-1).max(1),
            interpretacion: z.string(),
          })
          .strict()
      )
      .max(6),
    prevision: z
      .object({
        horizonte: z.enum(['1Y', '3Y', '5Y']),
        rango_esperado: z.string(),
        factor_invalidante: z.string(),
      })
      .strict(),
    opportunity_detected: z.boolean(),
    opportunity_description: z.string().max(1500).nullable(),
    confidence: z.number().int().min(0).max(100),
    narrative: z.string().max(2500),
  })
  .strict();
export type A2Output_t = z.infer<typeof A2Output>;

// ───────────────────────────────────────────────────────────────────────────
// 4. A3 Output — Técnico · Price Action
//
// IMPORTANTE: este schema es el contrato POST-refactor. En la Fase 1.3 el
// campo `narrative` será rellenado por `narrateA3()` (LLM) mientras que
// TODOS los demás campos serán producidos por `computeTechnical()` (código
// determinístico, sin LLM). Por eso `narrative` admite "" como caso degenerado
// si la narración falla — el resto del output sigue siendo válido.
// ───────────────────────────────────────────────────────────────────────────

export const A3Output = z
  .object({
    ticker: z.string().min(1).max(20),
    timeframes_analizados: z.array(z.string()).min(1).max(4),
    tendencia: z
      .object({
        primaria: TrendDirection,
        secundaria: TrendDirection,
        fuerza: z.number().int().min(1).max(5),
      })
      .strict(),
    soportes: z.array(z.number()).max(5),
    resistencias: z.array(z.number()).max(5),
    patron_detectado: z.string().nullable(),
    medias: z
      .object({
        sma20: z.number().nullable(),
        sma50: z.number().nullable(),
        sma200: z.number().nullable(),
        vwap: z.number().nullable(),
        golden_cross: z.boolean(),
        death_cross: z.boolean(),
      })
      .strict(),
    volumen: z
      .object({
        estado: VolumeState,
        comentario: z.string(),
      })
      .strict(),
    velas_relevantes: z.array(z.string()).max(5),
    operativa: z
      .object({
        signal: Signal,
        entrada: z.number().nullable(),
        stop_loss: z.number().nullable(),
        target: z.number().nullable(),
        atr_actual: z.number().nullable(),
        ratio_riesgo_beneficio: z.number().nullable(),
        horizonte: TradingHorizon,
      })
      .strict(),
    factor_invalidacion: z.string().max(1000),
    confidence: z.number().int().min(0).max(100),
    narrative: z.string().max(2500),
  })
  .strict();
export type A3Output_t = z.infer<typeof A3Output>;

// ───────────────────────────────────────────────────────────────────────────
// 5. Debate Output — A1 × A2
// ───────────────────────────────────────────────────────────────────────────

export const DebateOutput = z
  .object({
    ticker: z.string().min(1).max(20),
    convergence_score: z.number().int().min(0).max(100),
    argumento_a1: z.string().min(20).max(2000),
    argumento_a2: z.string().min(20).max(2000),
    puntos_convergencia: z.array(z.string().max(600)).max(5),
    puntos_divergencia: z.array(z.string().max(600)).max(5),
    punto_critico_de_debate: z.string().max(1000),
    oportunidad_validada: z.boolean(),
    direccion: z.enum(['alcista', 'bajista', 'neutral']),
    horizonte_relevante: z.string().max(500),
    recomendacion_consolidada: z.string().min(40).max(2500),
    factor_invalidante: z.string().max(1000),
  })
  .strict();
export type DebateOutput_t = z.infer<typeof DebateOutput>;

// ───────────────────────────────────────────────────────────────────────────
// 6. A4 Confluence — Resultado del compute determinístico
//
// Este schema corresponde al output de `computeConfluence()` (Tarea 1.4).
// A4 LLM lo RECIBE ya calculado; nunca lo produce.
// ───────────────────────────────────────────────────────────────────────────

export const ConfluenceResult = z
  .object({
    a3_solo: z
      .object({
        score: z.number().int().min(0).max(100),
        // A3 sola NUNCA llega a "alta" por diseño: una sola pata técnica no
        // constituye confluencia. Literal para que el código que la consuma
        // no tenga que defenderse de valores imposibles.
        nivel: z.literal('baja'),
      })
      .strict(),
    a1_a2: z
      .object({
        score: z.number().int().min(0).max(100),
        nivel: Confidence,
      })
      .strict(),
    alineados: z
      .object({
        score: z.number().int().min(0).max(100),
        nivel: Confidence,
      })
      .strict(),
    score_total_pct: z.number().int().min(0).max(100),
    nivel_final: Confidence,
  })
  .strict();
export type ConfluenceResult_t = z.infer<typeof ConfluenceResult>;

// ───────────────────────────────────────────────────────────────────────────
// 7. A4 Output final
// ───────────────────────────────────────────────────────────────────────────

/**
 * String literal exacto del disclaimer regulatorio. Cualquier variación lo
 * hace fallar contra el schema — es deliberado para evitar que el LLM se
 * invente disclaimers light. El separador del medio es U+00B7 (·), NO un
 * punto normal.
 */
export const DISCLAIMER_LITERAL =
  'Análisis educativo · no constituye asesoramiento financiero regulado';

export const A4Output = z
  .object({
    ticker: z.string().min(1).max(20),
    confluence: ConfluenceResult,
    resumen_a1: z.string().max(1500),
    resumen_a2: z.string().max(1500),
    resumen_a3: z.string().max(1500),
    direccion: Direction,
    confianza: Confidence,
    accion_sugerida: z.string().max(2500),
    riesgo_clave: z.string().max(1200),
    disclaimer: z.literal(DISCLAIMER_LITERAL),
  })
  .strict();
export type A4Output_t = z.infer<typeof A4Output>;

// ───────────────────────────────────────────────────────────────────────────
// 8. CMT Output — Autonomous Technician (escáner)
//
// Incluido aquí para tener TODA la familia consolidada, aunque CMT no
// participa del pipeline A1/A2/A3/A4 — corre como cron independiente.
// ───────────────────────────────────────────────────────────────────────────

export const CMTLevel = z.enum([
  'urgente',
  'atencion',
  'monitorear',
  'sin_senal',
]);
export type CMTLevel_t = z.infer<typeof CMTLevel>;

export const CMTOutput = z
  .object({
    ticker: z.string().min(1).max(20),
    level: CMTLevel,
    timeframe: z.string().min(1).max(10),
    setup_detected: z.string().min(3).max(300),
    confidence_pct: z.number().int().min(0).max(100),
    entry_price: z.number().nullable(),
    stop_loss: z.number().nullable(),
    target_price: z.number().nullable(),
    risk_reward_ratio: z.number().nullable(),
    indicators: z
      .record(z.string(), z.string())
      .refine((r) => Object.keys(r).length <= 5, {
        message: 'indicators máximo 5 entradas',
      }),
    invalidation_factor: z.string().min(3).max(300),
  })
  .strict();
export type CMTOutput_t = z.infer<typeof CMTOutput>;

// ───────────────────────────────────────────────────────────────────────────
// 9. Re-exports convenientes
// ───────────────────────────────────────────────────────────────────────────

/**
 * Mapa de schemas por nombre de agente. Útil para harness/eval/parsers
 * genéricos que reciben un identificador y necesitan validar.
 */
export const AGENT_SCHEMAS = {
  A1: A1Output,
  A2: A2Output,
  A3: A3Output,
  A4: A4Output,
  DEBATE: DebateOutput,
  CMT: CMTOutput,
} as const;

export type AgentName = keyof typeof AGENT_SCHEMAS;
