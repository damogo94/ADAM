/**
 * A.D.A.M. — `computeEstructura()` — orquestador determinista del Agente de
 * Estructura.
 *
 * Traduce el Manual Operativo a un output estructurado SIN LLM (igual que
 * `computeTechnical` de A3 / `buildCMTSignal` de CMT):
 *
 *   1. Deriva Weekly/Daily/H4/H1 de daily + intraday (timeframes.ts).
 *   2. Lee la estructura de cada TF: penúltimo/último alto-bajo + fase.
 *   3. Rango operativo + zona de retesteo desde el Daily (manual §1).
 *   4. Correlación entre temporalidades (manual §2).
 *   5. Confluencia "Eje Y": redondos + muro vanilla pluggable (manual §3).
 *   6. Secuencia de ejecución + gestión de riesgo (manual §4-§6).
 *   7. Confianza determinista + ensamblado.
 *
 * AISLAMIENTO (invariante, igual que A3/CMT): solo ticker + ohlcv (+ intraday
 * para MTF, + vanillaWalls para la confluencia institucional). El guard
 * estructural rechaza cualquier otra clave. NO es el aislamiento de A3 — es el
 * suyo propio, con su propio test.
 */

import { DISCLAIMER_LITERAL } from '@/agents/shared/types';
import { profileFor } from '@/agents/a3/profiles';
import type { OHLCVCandle_t } from '@/agents/shared/types';
import type { VanillaWall } from './vanilla';
import type {
  Correlacion_t,
  EstructuraComputeOutput_t,
  LecturaTimeframe_t,
} from './schema';
import { EstructuraComputeSchema } from './schema';
import { deriveTimeframes } from './compute/timeframes';
import { readStructure } from './compute/estructura';
import { computeRango } from './compute/rango';
import { computeConfluencia } from './compute/confluencia';
import { computeEjecucion } from './compute/ejecucion';

export interface ComputeEstructuraInput {
  ticker: string;
  /** Velas diarias (el "terreno de juego" del manual §1). */
  ohlcv: OHLCVCandle_t[];
  /** Velas horarias opcionales → derivan H4/H1. */
  intraday?: OHLCVCandle_t[];
  /**
   * Muros de opciones vanilla opcionales (Fase 3). En Fase 1 nadie los pobla;
   * los números redondos hacen de proxy de confluencia.
   */
  vanillaWalls?: VanillaWall[];
}

const CLAVES_PERMITIDAS = new Set(['ticker', 'ohlcv', 'intraday', 'vanillaWalls']);

export function computeEstructura(
  input: ComputeEstructuraInput
): EstructuraComputeOutput_t {
  // Aislamiento estructural: ninguna clave fuera del set permitido.
  for (const key of Object.keys(input)) {
    if (!CLAVES_PERMITIDAS.has(key)) {
      throw new Error(
        `[Estructura isolation violation] Campo no permitido: "${key}". ` +
          'El agente solo acepta ticker + ohlcv (+ intraday, + vanillaWalls).'
      );
    }
  }

  const { ticker, ohlcv, intraday, vanillaWalls } = input;
  const profile = profileFor(ticker);

  // 1. Temporalidades
  const series = deriveTimeframes(ohlcv, intraday);

  // 2. Lecturas estructurales
  const weekly = series.weekly ? readStructure(series.weekly, '1W', profile) : null;
  const daily = readStructure(series.daily, '1D', profile);
  const h4 = series.h4 ? readStructure(series.h4, '4H', profile) : null;
  const h1 = series.h1 ? readStructure(series.h1, '1H', profile) : null;

  // 3. Rango operativo (Daily)
  const rangoDaily = computeRango(daily, profile);

  // 4. Correlación entre temporalidades
  const correlacion = computeCorrelacion(weekly, daily, h4);

  // 5. Confluencia (Eje Y)
  const confluencia = computeConfluencia(rangoDaily, profile, vanillaWalls);

  // 6. Ejecución + gestión de riesgo
  const { setup, gestion, factor_invalidacion } = computeEjecucion({
    readings: { weekly, daily, h4, h1 },
    series,
    rangoDaily,
    profile,
  });

  // 7. Confianza determinista
  const confianza = computeConfianza({
    daily,
    alineacion: correlacion.alineacion,
    estado: setup.estado,
    setupPerfecto: confluencia.setup_perfecto,
    confluenciaScore: confluencia.score,
    rb: gestion.ratio_riesgo_beneficio,
  });

  const out: EstructuraComputeOutput_t = {
    ticker,
    contexto: { weekly, daily, h4, h1 },
    rango_operativo: rangoDaily,
    correlacion,
    confluencia,
    setup,
    gestion,
    confianza,
    factor_invalidacion,
    disclaimer: DISCLAIMER_LITERAL,
  };

  // Red de seguridad: valida el contrato (sin narrative).
  return EstructuraComputeSchema.parse(out);
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/** Alineación Weekly/Daily/H4 (manual §2). Lateral no contradice. */
export function computeCorrelacion(
  weekly: LecturaTimeframe_t | null,
  daily: LecturaTimeframe_t,
  h4: LecturaTimeframe_t | null
): Correlacion_t {
  const dirs = [weekly?.direccion, daily.direccion, h4?.direccion].filter(
    (d): d is LecturaTimeframe_t['direccion'] => d != null && d !== 'lateral'
  );

  if (dirs.length === 0) {
    return {
      alineacion: 'neutral',
      descripcion: 'Sin dirección dominante clara entre temporalidades — consolidación.',
    };
  }
  const primera = dirs[0]!;
  const todasIguales = dirs.every((d) => d === primera);
  if (todasIguales) {
    return {
      alineacion: 'confirmada',
      descripcion: `Temporalidades alineadas en ${primera} — confluencia refuerza el sesgo.`,
    };
  }
  return {
    alineacion: 'divergente',
    descripcion:
      'Temporalidades en direcciones opuestas — divergencia; cautela, posible cambio de régimen.',
  };
}

/** Confianza 0-100 determinista a partir de los factores de la estrategia. */
export function computeConfianza(p: {
  daily: LecturaTimeframe_t;
  alineacion: Correlacion_t['alineacion'];
  estado: EstructuraComputeOutput_t['setup']['estado'];
  setupPerfecto: boolean;
  confluenciaScore: number;
  rb: number | null;
}): number {
  let c = 0;
  if (p.daily.direccion !== 'lateral') c += 20;

  if (p.alineacion === 'confirmada') c += 20;
  else if (p.alineacion === 'divergente') c -= 15;

  switch (p.estado) {
    case 'listo':
      c += 30;
      break;
    case 'esperando_confirmacion':
      c += 15;
      break;
    case 'esperando_zona':
      c += 5;
      break;
    default:
      break;
  }

  if (p.setupPerfecto) c += 15;
  else c += Math.round(p.confluenciaScore / 10);

  if (p.rb != null) c += p.rb >= 2 ? 15 : 10;

  return Math.max(0, Math.min(100, c));
}
