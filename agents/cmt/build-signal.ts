/**
 * A.D.A.M. — buildCMTSignal — CMT 100% determinista (cero LLM)
 *
 * Reemplaza al antiguo `runCMT` (un LLM eyeballeando 200 velas y "calculando"
 * de cabeza SMAs/niveles/R-B). Ahora reutiliza `computeTechnical()` —el mismo
 * motor determinista de A3— y deriva la señal CMT del compute:
 *
 *   - números (entrada/stop/target/R-B/indicadores/confianza/invalidación) →
 *     del compute, con R/B≥1.5 FORZADO en código. Cero alucinación aritmética.
 *   - nivel (urgente/atención/monitorear/sin_señal) → mapeo determinista desde
 *     signal + R/B + entry_type + distancias en ATR (ver `classifyCMTLevel`:
 *     el nivel describe TIPO DE ENTRADA / ALCANZABILIDAD, no calidad).
 *   - setup_detected → template determinista con los hechos ya calculados.
 *
 * Beneficios: gratis (0 tokens), instantáneo (0 latencia LLM, el lambda de 60s
 * deja de ser límite), 100% fiable (sin parseos fallidos) y medible/tuneable
 * (los umbrales de nivel son explícitos → cruzar con signal_trade_outcomes).
 *
 * AISLAMIENTO (invariante, igual que A3): sólo ticker + ohlcv (+ intraday para
 * MTF). El guard estructural rechaza cualquier otra clave; al no haber prompt
 * que inyectar, el aislamiento es estructural, no textual.
 *
 * El TIMEFRAME es siempre '1D': la señal sale del compute diario. El intraday
 * NO genera señales 1H (que el cron de outcomes no puede evaluar) — sólo
 * alimenta el MTF (agrega a 4H y ajusta la confianza del setup diario).
 */

import { computeTechnical, type ComputeTechnicalOutput } from '@/agents/a3/compute';
import { CMT_OUTPUT_SCHEMA, type CMTOutput } from './schema';
import type { OHLCVCandle_t } from '@/agents/shared/types';

export interface CMTBuildInput {
  ticker: string;
  /** Velas diarias (idealmente ≥200 para SMA200). */
  ohlcv: OHLCVCandle_t[];
  /** Velas horarias (≥24) → MTF. Opcional; NO genera señal 1H. */
  intraday?: OHLCVCandle_t[];
}

type CMTLevel = CMTOutput['level'];

export function buildCMTSignal(input: CMTBuildInput): CMTOutput {
  // Aislamiento estructural: ninguna clave fuera del set OHLCV.
  const allowed = new Set(['ticker', 'ohlcv', 'intraday']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(
        `[CMT isolation violation] Campo no permitido: "${key}". CMT sólo acepta ticker + ohlcv (+ intraday).`
      );
    }
  }

  const compute = computeTechnical({
    ticker: input.ticker,
    ohlcv: input.ohlcv,
    timeframe: '1D',
    intraday: input.intraday,
  });

  const op = compute.operativa;
  // Distancias en ATR para el nivel. El ATR sale SIEMPRE del compute
  // (`operativa.atr_actual`, ATR14 sobre el OHLCV) — nunca de |stop−entrada|,
  // que en el generador es una función del propio ATR (stop = nivel ± ATR) y
  // haría circular la medida. Último cierre = última vela del daily.
  const lastClose = input.ohlcv.length > 0 ? input.ohlcv[input.ohlcv.length - 1]!.c : null;
  const level = classifyCMTLevel({
    signal: op.signal,
    rb: op.ratio_riesgo_beneficio,
    entryType: op.entry_type ?? null,
    entryDistanceAtr: distanceInAtr(op.entrada, lastClose, op.atr_actual),
    targetDistanceAtr: distanceInAtr(op.target, op.entrada, op.atr_actual),
  });

  const signal: CMTOutput = {
    ticker: compute.ticker,
    level,
    timeframe: '1D',
    setup_detected: buildSetupDetected(compute, level),
    confidence_pct: compute.confidence,
    entry_type: op.entry_type ?? null,
    entry_price: op.entrada,
    stop_loss: op.stop_loss,
    target_price: op.target,
    risk_reward_ratio: op.ratio_riesgo_beneficio,
    indicators: buildIndicators(compute),
    invalidation_factor: compute.factor_invalidacion,
  };

  // Red de seguridad: valida el contrato (enum nivel, longitudes, ≤5 indicators).
  return CMT_OUTPUT_SCHEMA.parse(signal);
}

/**
 * R/B mínimo para que la señal exista como tal (por debajo → `sin_senal`, el
 * scan la descarta sin persistir). Coincide con el default del compute.
 */
const MIN_RB_SIGNAL = 1.5;

/**
 * Distancia máxima (en ATR) entre el último cierre y una entrada LÍMITE para
 * considerarla alcanzable a corto plazo. Umbral de F2 del plan de precisión
 * 2026-09: in-sample, las límite rellenadas ganadoras estaban todas a ≤1.7 ATR
 * y por encima de 2 ATR no hubo ninguna ganada (0W/16L/12NF). Es una marca de
 * alcanzabilidad, NO un filtro: la señal se emite igual, solo cambia el nivel.
 */
export const ENTRY_REACH_ATR = 2;

/**
 * Cota de coherencia target↔ventana (F3 del plan). El horizonte del compute
 * modela el tiempo hasta el target como K² barras con K = |target−entrada|/ATR
 * (`horizonteFromTarget`, paseo aleatorio). El cron `evaluate-signal-trades`
 * evalúa toda señal 1D en una ventana de 30 días naturales (`WINDOW_DAYS`), así
 * que un target a más de √30 ≈ 5.48 ATR no cabe estadísticamente en su propia
 * ventana de evaluación. La constante se DERIVA del código (K² ↔ 30d), no se
 * eligió mirando la muestra. Si cambia `WINDOW_DAYS`, cambia esto con él.
 */
export const TARGET_MAX_ATR = Math.sqrt(30);

/**
 * Mapeo determinista del nivel CMT desde el compute.
 *
 * SEMÁNTICA (plan de precisión 2026-09 · R10): el nivel describe el TIPO DE
 * ENTRADA y su ALCANZABILIDAD — cuándo y si la orden puede ejecutarse y el
 * target caber en la ventana de evaluación — y NO una prioridad de calidad.
 * La versión anterior hacía `urgente` ≈ "venta a mercado con R/B≥2.5 y
 * confianza≥70", que in-sample fue 0W/11L mientras el radar lo mostraba como
 * la señal "mejor". Confianza y MTF ya viajan en `confidence_pct`/`indicators`;
 * aquí no votan.
 *
 *   - hold / R/B null / R/B<1.5                 → sin_senal (no se persiste)
 *   - K = |target−entrada|/ATR > √30 ≈ 5.48     → monitorear (target incoherente
 *                                                  con la ventana de 30d, sea
 *                                                  cual sea el tipo de entrada)
 *   - entrada a mercado                          → urgente   (ejecutable hoy)
 *   - límite a ≤ 2 ATR del último cierre         → atencion  (alcanzable)
 *   - límite a > 2 ATR, o distancia no medible   → monitorear
 *
 * Las distancias las calcula `buildCMTSignal` con el ATR del compute
 * (`operativa.atr_actual`); `null` = ATR no disponible. El enum de DB
 * (`signal_level`) y el shape de `CMTOutput` no cambian.
 */
export function classifyCMTLevel(p: {
  signal: 'buy' | 'sell' | 'hold';
  rb: number | null;
  entryType: 'market' | 'limit' | null;
  /** |entrada − último cierre| / ATR. null si no hay ATR o entrada. */
  entryDistanceAtr: number | null;
  /** K = |target − entrada| / ATR. null si no hay ATR, target o entrada. */
  targetDistanceAtr: number | null;
}): CMTLevel {
  if (p.signal === 'hold' || p.rb == null || p.rb < MIN_RB_SIGNAL) return 'sin_senal';

  // Coherencia target↔ventana: aplica a cualquier tipo de entrada — una orden a
  // mercado se rellena hoy pero su target no cabe en los 30d del cron.
  if (p.targetDistanceAtr != null && p.targetDistanceAtr > TARGET_MAX_ATR) return 'monitorear';

  if (p.entryType === 'market') return 'urgente';
  if (p.entryType === 'limit' && p.entryDistanceAtr != null && p.entryDistanceAtr <= ENTRY_REACH_ATR) {
    return 'atencion';
  }
  return 'monitorear';
}

/**
 * |a − b| / atr, o null si falta cualquier operando o el ATR no es positivo.
 * Helper puro para las distancias del nivel; exportado para poder testearlo.
 */
export function distanceInAtr(a: number | null, b: number | null, atr: number | null): number | null {
  if (a == null || b == null || atr == null || !(atr > 0)) return null;
  return Math.abs(a - b) / atr;
}

function buildSetupDetected(c: ComputeTechnicalOutput, level: CMTLevel): string {
  const op = c.operativa;
  if (level === 'sin_senal' || op.signal === 'hold') {
    return `Sin setup operativo con R/B≥1.5 cerca de un nivel — tendencia ${c.tendencia.primaria}, estructura sin trigger inmediato.`.slice(
      0,
      300
    );
  }
  const dir = op.signal === 'buy' ? 'Compra' : 'Venta';
  const tipo = op.entry_type === 'market' ? 'a mercado' : 'en límite';
  const rb = op.ratio_riesgo_beneficio != null ? op.ratio_riesgo_beneficio.toFixed(2) : 'n/d';
  const mtf = c.mtf ? ` · 4H ${c.mtf.alignment}` : '';
  return `${dir} ${tipo} ${op.entrada} · stop ${op.stop_loss} · target ${op.target} (R/B ${rb}) — tendencia ${c.tendencia.primaria} fuerza ${c.tendencia.fuerza}/5, volumen ${c.volumen.estado}${mtf}.`.slice(
    0,
    300
  );
}

function buildIndicators(c: ComputeTechnicalOutput): Record<string, string> {
  // Redondeo cosmético: ≤4 decimales sin ceros sobrantes. Sirve a todas las
  // clases (commodities/equities a 2, forex/crypto con más resolución) sin
  // arrastrar la cola binaria cruda del float (ej. 4505.02998046875).
  const fmt = (n: number | null) => (n == null ? 'n/d' : String(Number(n.toFixed(4))));
  const cross = c.medias.golden_cross
    ? ' · golden cross'
    : c.medias.death_cross
      ? ' · death cross'
      : '';

  // Máx 5 entradas (lo exige el schema): tendencia, medias, [rsi], volumen, [mtf].
  const ind: Record<string, string> = {
    tendencia: `${c.tendencia.primaria} (fuerza ${c.tendencia.fuerza}/5)`,
    medias: `SMA20 ${fmt(c.medias.sma20)} / SMA50 ${fmt(c.medias.sma50)}${cross}`,
    volumen: c.volumen.estado,
  };
  if (c.osciladores?.rsi14 != null) ind.rsi = `RSI14 ${c.osciladores.rsi14.toFixed(0)}`;
  if (c.mtf) ind.mtf = `4H ${c.mtf.alignment}`;
  // Rango 52 semanas (opción C: entra en el map jsonb, sin columna/migración en
  // signals_history). Solo si el compute lo trae (≥200 velas). El cap del schema
  // es 6 → cabe junto a tendencia/medias/volumen/rsi/mtf sin desbordar.
  if (c.rango_52s) {
    ind.rango_52s = `${c.rango_52s.posicion_pct.toFixed(0)}% del rango · máx ${fmt(c.rango_52s.high)} / mín ${fmt(c.rango_52s.low)}`;
  }
  return ind;
}
