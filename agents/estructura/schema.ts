/**
 * A.D.A.M. — Agente de Estructura · contrato (Zod)
 *
 * Traduce fielmente el "Manual Operativo" a un output estructurado y
 * determinista. Las 6 secciones del manual se mapean 1:1:
 *
 *   1. Contexto y Dirección          → `contexto` (Weekly/Daily/H4/H1) + `rango_operativo`
 *   2. Correlación de Temporalidades → `correlacion`
 *   3. Confluencia Institucional (Eje Y) → `confluencia` (redondos + muro vanilla)
 *   4. Secuencia de Ejecución        → `setup.timeframe_zona` / `setup.timeframe_entrada`
 *   5. Patrones de Confirmación      → `setup.gatillo` (M / W / ruptura de impulso)
 *   6. Gestión de Riesgo             → `gestion` (SL estructural, BE, TP estructural, R/B)
 *
 * Patrón (idéntico a A3): `computeEstructura()` produce TODO menos `narrative`
 * (determinista, cero LLM); `narrateEstructura()` (PR2) rellena `narrative`.
 * El `disclaimer` es un literal merged en código (igual que A4).
 */

import { z } from 'zod';
import { TrendDirection, DISCLAIMER_LITERAL } from '@/agents/shared/types';

/** Temporalidades del sistema (manual §1-§2). */
export const EstructuraTimeframe = z.enum(['1W', '1D', '4H', '1H']);
export type EstructuraTimeframe_t = z.infer<typeof EstructuraTimeframe>;

/** Impulso vs retroceso (manual §1: "¿estamos en un impulso o un retroceso?"). */
export const FaseEstructura = z.enum(['impulso', 'retroceso', 'indefinido']);
export type FaseEstructura_t = z.infer<typeof FaseEstructura>;

/** Patrón de gatillo (manual §5). */
export const Gatillo = z.enum(['M', 'W', 'ruptura_impulso', 'ninguno']);
export type Gatillo_t = z.infer<typeof Gatillo>;

/** Dirección operativa del setup. */
export const DireccionSetup = z.enum(['compra', 'venta', 'ninguno']);
export type DireccionSetup_t = z.infer<typeof DireccionSetup>;

/**
 * Estado del setup en la máquina de la estrategia:
 *   - sin_estructura        → datos insuficientes para leer la estructura
 *   - esperando_zona        → estructura clara pero el precio no está en zona de retesteo
 *   - esperando_confirmacion→ precio en zona, falta el gatillo (M/W/ruptura)
 *   - listo                 → zona + gatillo presentes, plan ejecutable
 *   - sin_setup             → no hay setup con R/B ≥ mínimo
 */
export const EstadoSetup = z.enum([
  'sin_estructura',
  'esperando_zona',
  'esperando_confirmacion',
  'listo',
  'sin_setup',
]);
export type EstadoSetup_t = z.infer<typeof EstadoSetup>;

/** Lectura estructural de UN timeframe (manual §1: penúltimo/último alto-bajo). */
export const LecturaTimeframe = z
  .object({
    timeframe: EstructuraTimeframe,
    direccion: TrendDirection, // alcista / bajista / lateral
    fase: FaseEstructura,
    penultimo_alto: z.number().nullable(),
    ultimo_alto: z.number().nullable(),
    penultimo_bajo: z.number().nullable(),
    ultimo_bajo: z.number().nullable(),
    velas_analizadas: z.number().int().nonnegative(),
  })
  .strict();
export type LecturaTimeframe_t = z.infer<typeof LecturaTimeframe>;

/** Banda de precio alrededor de un nivel de retesteo. */
export const ZonaRetesteo = z
  .object({
    nivel: z.number(),
    min: z.number(),
    max: z.number(),
    descripcion: z.string().max(200),
  })
  .strict();
export type ZonaRetesteo_t = z.infer<typeof ZonaRetesteo>;

/**
 * Rango operativo (manual §1): distancia entre el penúltimo y el último
 * extremo del impulso dominante. Define la zona de "rompe y apoya".
 */
export const RangoOperativo = z
  .object({
    desde: z.number().nullable(), // penúltimo extremo
    hasta: z.number().nullable(), // último extremo
    amplitud: z.number().nullable(), // |hasta - desde|
    zona_retesteo: ZonaRetesteo.nullable(),
  })
  .strict();
export type RangoOperativo_t = z.infer<typeof RangoOperativo>;

/**
 * Confluencia institucional / "Eje Y" (manual §3).
 *
 * `barrera_vanilla` es el hueco pluggable: en la Fase 1 es siempre `null`
 * (no hay fuente de open interest en ADAM); los números redondos hacen de
 * proxy. Cuando se integre un proveedor de opciones (Fase 3), se puebla con
 * el strike del muro más cercano sin cambiar el contrato.
 */
export const Confluencia = z
  .object({
    precio_redondo: z.number().nullable(),
    distancia_redondo_pct: z.number().nullable(),
    barrera_vanilla: z.number().nullable(),
    vanilla_disponible: z.boolean(), // false en Fase 1 (sin datos de opciones)
    setup_perfecto: z.boolean(),
    score: z.number().int().min(0).max(100),
    descripcion: z.string().max(300),
  })
  .strict();
export type Confluencia_t = z.infer<typeof Confluencia>;

/** Correlación entre temporalidades (manual §2). */
export const Correlacion = z
  .object({
    alineacion: z.enum(['confirmada', 'neutral', 'divergente']),
    descripcion: z.string().max(300),
  })
  .strict();
export type Correlacion_t = z.infer<typeof Correlacion>;

/** Setup: dónde nace la zona, dónde se entra y con qué gatillo (manual §4-§5). */
export const Setup = z
  .object({
    direccion: DireccionSetup,
    timeframe_zona: EstructuraTimeframe.nullable(),
    timeframe_entrada: EstructuraTimeframe.nullable(),
    gatillo: Gatillo,
    estado: EstadoSetup,
  })
  .strict();
export type Setup_t = z.infer<typeof Setup>;

/** Gestión de riesgo (manual §6): SL estructural, BE, TP estructural, R/B. */
export const Gestion = z
  .object({
    entrada: z.number().nullable(),
    entry_type: z.enum(['market', 'limit']).nullable(),
    stop_loss: z.number().nullable(),
    take_profit: z.number().nullable(),
    break_even_trigger: z.number().nullable(),
    ratio_riesgo_beneficio: z.number().nullable(),
  })
  .strict();
export type Gestion_t = z.infer<typeof Gestion>;

/** Output completo del Agente de Estructura. */
export const EstructuraOutput = z
  .object({
    ticker: z.string().min(1).max(20),
    contexto: z
      .object({
        weekly: LecturaTimeframe.nullable(),
        daily: LecturaTimeframe,
        h4: LecturaTimeframe.nullable(),
        h1: LecturaTimeframe.nullable(),
      })
      .strict(),
    rango_operativo: RangoOperativo,
    correlacion: Correlacion,
    confluencia: Confluencia,
    setup: Setup,
    gestion: Gestion,
    confianza: z.number().int().min(0).max(100),
    factor_invalidacion: z.string().min(3).max(300),
    /**
     * Narrativa (capa LLM, PR2). Admite "" como caso degenerado si la
     * narración falla — el resto del output sigue siendo válido (igual que A3).
     */
    narrative: z.string().max(2500),
    disclaimer: z.literal(DISCLAIMER_LITERAL),
  })
  .strict();
export type EstructuraOutput_t = z.infer<typeof EstructuraOutput>;

/**
 * Salida del compute determinista = EstructuraOutput sin `narrative`.
 * El `disclaimer` SÍ va aquí (literal, determinista). `narrative` lo añade
 * `narrateEstructura()` en PR2.
 */
export const EstructuraComputeSchema = EstructuraOutput.omit({ narrative: true });
export type EstructuraComputeOutput_t = z.infer<typeof EstructuraComputeSchema>;

/**
 * Lo que el LLM produce en la capa narrate: SOLO la prosa. El código mergea
 * el resto (determinista) + el disclaimer literal (igual que A3 / A4).
 */
export const EstructuraNarrativeOnly = z
  .object({
    narrative: z.string().min(20).max(2500),
  })
  .strict();
export type EstructuraNarrativeOnly_t = z.infer<typeof EstructuraNarrativeOnly>;
