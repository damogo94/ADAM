/**
 * A.D.A.M. — Estructura · secuencia de ejecución + gestión de riesgo
 *
 * Une las piezas del manual:
 *   §1-§2  Operamos A FAVOR de la corriente (Weekly macro, Daily terreno) y
 *          buscamos el retesteo "rompe y apoya" en la temporalidad alineada.
 *   §4     La zona activa (Daily / H4 / H1) dicta la temporalidad de entrada.
 *   §5     El gatillo (M / W / ruptura de impulso) confirma el disparo.
 *   §6     SL estructural detrás del último alto/bajo, BE a 1R, TP estructural
 *          en el siguiente extremo, R/B ≥ mínimo FORZADO en código.
 *
 * Degradación honesta: sin datos intradía suficientes, H4/H1 son `null` y la
 * zona activa se evalúa sobre Daily (entrada en Daily).
 */

import { atrLast } from '@/agents/a3/compute/indicators';
import { roundProfile, type AssetProfile } from '@/agents/a3/profiles';
import type { OHLCVCandle_t } from '@/agents/shared/types';
import { computeRango, enZona } from './rango';
import { detectGatillo } from './gatillo';
import type { TimeframeSeries } from './timeframes';
import type {
  DireccionSetup_t,
  EstadoSetup_t,
  EstructuraTimeframe_t,
  Gatillo_t,
  Gestion_t,
  LecturaTimeframe_t,
  RangoOperativo_t,
  Setup_t,
} from '../schema';

export interface EjecucionInput {
  readings: {
    weekly: LecturaTimeframe_t | null;
    daily: LecturaTimeframe_t;
    h4: LecturaTimeframe_t | null;
    h1: LecturaTimeframe_t | null;
  };
  series: TimeframeSeries;
  rangoDaily: RangoOperativo_t;
  profile: AssetProfile;
}

export interface EjecucionResult {
  setup: Setup_t;
  gestion: Gestion_t;
  /** Factor que invalidaría el plan (texto determinista). */
  factor_invalidacion: string;
}

interface Candidato {
  lectura: LecturaTimeframe_t;
  candles: OHLCVCandle_t[];
  rango: RangoOperativo_t;
}

const SETUP_VACIO = (
  direccion: DireccionSetup_t,
  estado: EstadoSetup_t,
  zona: EstructuraTimeframe_t | null
): Setup_t => ({
  direccion,
  timeframe_zona: zona,
  timeframe_entrada: null,
  gatillo: 'ninguno',
  estado,
});

const GESTION_VACIA: Gestion_t = {
  entrada: null,
  entry_type: null,
  stop_loss: null,
  take_profit: null,
  break_even_trigger: null,
  ratio_riesgo_beneficio: null,
};

export function computeEjecucion(input: EjecucionInput): EjecucionResult {
  const { readings, series, rangoDaily, profile } = input;
  const { daily } = readings;
  const round = (n: number) => roundProfile(n, profile);

  // Sin velas diarias no hay nada que leer (símbolo inválido / sin datos).
  if (series.daily.length === 0) {
    return {
      setup: SETUP_VACIO('ninguno', 'sin_estructura', null),
      gestion: GESTION_VACIA,
      factor_invalidacion: 'Sin datos de mercado para el símbolo.',
    };
  }
  const price = series.daily[series.daily.length - 1]!.c;

  // ── Sesgo macro: operamos a favor de la corriente (manual §1) ──────────
  const macro = daily.direccion;
  if (macro === 'lateral') {
    return {
      setup: SETUP_VACIO('ninguno', 'esperando_zona', null),
      gestion: GESTION_VACIA,
      factor_invalidacion:
        'Daily lateral: sin sesgo direccional claro. Esperar definición de estructura.',
    };
  }
  const direccion: DireccionSetup_t = macro === 'alcista' ? 'compra' : 'venta';

  // Weekly no debe contradecir al Daily (no operar contra la corriente macro).
  const wk = readings.weekly;
  if (wk && wk.direccion !== 'lateral' && wk.direccion !== macro) {
    return {
      setup: SETUP_VACIO(direccion, 'sin_setup', null),
      gestion: GESTION_VACIA,
      factor_invalidacion: `Weekly ${wk.direccion} contradice el Daily ${macro}: divergencia macro, no operar contra corriente.`,
    };
  }

  // ── Candidatos de zona, de mayor a menor temporalidad (manual §2) ──────
  const candidatos: Candidato[] = [{ lectura: daily, candles: series.daily, rango: rangoDaily }];
  if (readings.h4 && series.h4) {
    candidatos.push({ lectura: readings.h4, candles: series.h4, rango: computeRango(readings.h4, profile) });
  }
  if (readings.h1 && series.h1) {
    candidatos.push({ lectura: readings.h1, candles: series.h1, rango: computeRango(readings.h1, profile) });
  }

  // Zona activa = la temporalidad MÁS ALTA alineada con el macro cuyo precio
  // está dentro de su banda de retesteo.
  const activo = candidatos.find(
    (c) => c.lectura.direccion === macro && enZona(price, c.rango)
  );

  if (!activo || !activo.rango.zona_retesteo) {
    return {
      setup: SETUP_VACIO(direccion, 'esperando_zona', null),
      gestion: GESTION_VACIA,
      factor_invalidacion:
        'Estructura y sesgo claros, pero el precio no está en la zona de retesteo. Esperar el "rompe y apoya".',
    };
  }

  const zonaTf = activo.lectura.timeframe;

  // Temporalidad de entrada: H1 si hay datos; si no, la propia zona (manual §4).
  const entry =
    readings.h1 && series.h1
      ? { lectura: readings.h1, candles: series.h1 }
      : { lectura: activo.lectura, candles: activo.candles };

  // ── Gatillo en la temporalidad de entrada (manual §5) ──────────────────
  const breakLevel =
    direccion === 'compra' ? entry.lectura.ultimo_alto : entry.lectura.ultimo_bajo;
  const gatillo: Gatillo_t = detectGatillo(entry.candles, direccion, breakLevel);

  // ── Gestión de riesgo (manual §6) ──────────────────────────────────────
  const zonaNivel = activo.rango.zona_retesteo.nivel;
  const proximityAbs = price * (profile.proximity_pct / 100);
  const entry_type: 'market' | 'limit' =
    Math.abs(price - zonaNivel) <= proximityAbs ? 'market' : 'limit';
  const entrada = entry_type === 'market' ? price : zonaNivel;

  const atrEntry =
    atrLast(entry.candles, 14) ?? entrada * (profile.atr_fallback_pct / 100);
  const buffer = atrEntry * 0.1;

  const gestion = buildGestion({
    direccion,
    entrada,
    entry_type,
    atrBuffer: buffer,
    entryLow: entry.lectura.ultimo_bajo,
    entryHigh: entry.lectura.ultimo_alto,
    tpStructural: direccion === 'compra' ? daily.ultimo_alto : daily.ultimo_bajo,
    minRb: profile.min_rb_ratio,
    round,
  });

  // ── Estado de la máquina ────────────────────────────────────────────────
  let estado: EstadoSetup_t;
  if (gestion.ratio_riesgo_beneficio == null) {
    estado = 'sin_setup';
  } else if (gatillo === 'ninguno') {
    estado = 'esperando_confirmacion';
  } else {
    estado = 'listo';
  }

  const factor_invalidacion = buildInvalidacion(direccion, gestion, estado, zonaTf);

  return {
    setup: {
      direccion,
      timeframe_zona: zonaTf,
      timeframe_entrada: entry.lectura.timeframe,
      gatillo,
      estado,
    },
    gestion: estado === 'sin_setup' ? GESTION_VACIA : gestion,
    factor_invalidacion,
  };
}

function buildGestion(p: {
  direccion: DireccionSetup_t;
  entrada: number;
  entry_type: 'market' | 'limit';
  atrBuffer: number;
  entryLow: number | null;
  entryHigh: number | null;
  tpStructural: number | null;
  minRb: number;
  round: (n: number) => number;
}): Gestion_t {
  const { direccion, entrada, entry_type, atrBuffer, round, minRb } = p;

  if (direccion === 'compra') {
    // SL estructural detrás del último bajo de la entrada.
    const base =
      p.entryLow != null && p.entryLow < entrada ? p.entryLow : entrada - atrBuffer * 10;
    const stop_loss = round(base - atrBuffer);
    const take_profit =
      p.tpStructural != null && p.tpStructural > entrada ? round(p.tpStructural) : null;
    const riesgo = entrada - stop_loss;
    const beneficio = take_profit != null ? take_profit - entrada : -1;
    if (riesgo <= 0 || beneficio <= 0) return GESTION_VACIA;
    const rb = beneficio / riesgo;
    if (rb < minRb) return GESTION_VACIA;
    return {
      entrada: round(entrada),
      entry_type,
      stop_loss,
      take_profit,
      break_even_trigger: round(entrada + riesgo), // BE a 1R
      ratio_riesgo_beneficio: round(rb),
    };
  }

  // venta
  const base =
    p.entryHigh != null && p.entryHigh > entrada ? p.entryHigh : entrada + atrBuffer * 10;
  const stop_loss = round(base + atrBuffer);
  const take_profit =
    p.tpStructural != null && p.tpStructural < entrada ? round(p.tpStructural) : null;
  const riesgo = stop_loss - entrada;
  const beneficio = take_profit != null ? entrada - take_profit : -1;
  if (riesgo <= 0 || beneficio <= 0) return GESTION_VACIA;
  const rb = beneficio / riesgo;
  if (rb < minRb) return GESTION_VACIA;
  return {
    entrada: round(entrada),
    entry_type,
    stop_loss,
    take_profit,
    break_even_trigger: round(entrada - riesgo), // BE a 1R
    ratio_riesgo_beneficio: round(rb),
  };
}

function buildInvalidacion(
  direccion: DireccionSetup_t,
  gestion: Gestion_t,
  estado: EstadoSetup_t,
  zonaTf: EstructuraTimeframe_t
): string {
  if (estado === 'sin_setup' || gestion.stop_loss == null) {
    return `Zona ${zonaTf} alcanzada pero sin R/B suficiente o sin objetivo estructural válido. No operar.`;
  }
  const lado = direccion === 'compra' ? 'por debajo' : 'por encima';
  return `Cierre ${lado} de ${gestion.stop_loss} (detrás del último extremo de la entrada) invalida el plan y activa el stop estructural.`;
}
