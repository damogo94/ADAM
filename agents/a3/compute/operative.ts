/**
 * A.D.A.M. — Gestión operativa (compute layer)
 *
 * Refactor Fase 1 · Tarea 1.3
 *
 * Decide signal (buy/sell/hold) y calcula entrada/stop/target/R-B/horizonte
 * a partir de los outputs de indicators + trend + levels + patterns.
 *
 * Reglas operativas EMBEBIDAS EN CÓDIGO (acuerdo §5 Tarea 1.3):
 *   1. R/B mínimo 1.5:1 → si no se cumple, signal: "hold" + niveles null.
 *   2. Stop al OTRO LADO de un nivel técnico, NO % arbitrario.
 *   3. Target sobre un nivel técnico (resistencia para buy, soporte para sell).
 *   4. Si `ohlcv.length < 20` → signal: "hold", confidence ≤ 30.
 *   5. Si `ohlcv.length < 200` → la SMA200 será null (se hace en indicators.ts).
 *
 * Decisión sobre signal (ADR-002 fase 2 — modelo de PLAN, no "operar ya"):
 *   - alcista + soporte+resistencia presentes + soporte alcanzable → buy
 *   - bajista + resistencia+soporte presentes + resistencia alcanzable → sell
 *   - lateral, falta un nivel, no alcanzable, o R/B < min → hold
 *
 * Entrada (`entry_type`):
 *   - 'market': el precio ya está pegado al nivel (≤ proximity_pct) → entrar ya.
 *   - 'limit':  esperar el retroceso/rebote al nivel (entrada = el propio nivel),
 *     siempre que esté a ≤ REACH_ATR_MULT·ATR (alcanzable dentro del horizonte).
 *
 * Shadow tags (plan precisión 2026-09, §4 F1/F1'/F2 + R11): `veto_regimen` y
 * `distancia_entrada_atr` se calculan por código SOBRE el plan ya decidido y
 * se persisten como marcas. NO filtran, NO degradan a hold, NO tocan
 * REACH_ATR_MULT ni el sesgo buy/sell — degradar a hold borraría el rastro que
 * queremos medir (cmt/scan descarta sin_senal, evaluate-trades filtra buy/sell).
 */

import type {
  OHLCVCandle_t,
  Signal_t,
  TradingHorizon_t,
  TrendDirection_t,
} from '@/agents/shared/types';
import type { LevelsResult } from './levels';
import { roundProfile, type AssetProfile } from '../profiles';

export interface OperativaResult {
  signal: Signal_t;
  entrada: number | null;
  stop_loss: number | null;
  target: number | null;
  atr_actual: number | null;
  ratio_riesgo_beneficio: number | null;
  horizonte: TradingHorizon_t;
  /**
   * Tipo de entrada del plan (ADR-002 fase 2):
   *   - 'market': el precio ya está pegado al nivel → entrar ya.
   *   - 'limit':  esperar el retroceso al nivel (entrada = el propio nivel).
   *   - null:     hold (no hay plan).
   */
  entry_type: 'market' | 'limit' | null;
  /**
   * SHADOW TAG F1/F1' (plan precisión 2026-09, R11) — SOLO MARCA, NUNCA FILTRO.
   * `true` si la operativa va contra el régimen mayor medido por la SMA200:
   * (sell y precio actual > SMA200) o (buy y precio actual < SMA200).
   * `false` si va a favor (o el precio está exactamente en la SMA200).
   * `null` si no hay SMA200 (<200 velas) o no hay operativa (hold).
   * La señal, entrada, stop, target y horizonte NO cambian por esta marca:
   * existe para medir el gate en producción antes de decidir nada.
   */
  veto_regimen: boolean | null;
  /**
   * SHADOW TAG F2 (plan precisión 2026-09) — SOLO MARCA, NUNCA FILTRO.
   * Distancia de la entrada al precio actual en múltiplos de ATR:
   * |entrada − precio actual| / ATR. `0` para entradas a mercado (por
   * construcción), `null` si no hay ATR (atr_actual null) o no hay plan (hold).
   */
  distancia_entrada_atr: number | null;
}

/** Plan geométrico sin las marcas shadow (lo que decide el compute histórico). */
type OperativaPlan = Omit<OperativaResult, 'veto_regimen' | 'distancia_entrada_atr'>;

export interface OperativaInput {
  candles: OHLCVCandle_t[];
  tendencia: TrendDirection_t;
  levels: LevelsResult;
  atr: number | null;
  /**
   * SMA200 (de compute, derivada SOLO de las velas; null si <200). Alimenta
   * únicamente la marca `veto_regimen` (shadow tag F1/F1'): no participa en la
   * decisión buy/sell/hold ni en la geometría del plan. Opcional para
   * backward compatibility (ausente → veto_regimen null).
   */
  sma200?: number | null;
  /**
   * Profile derivado del ticker en compute.ts (PR5). Opcional para
   * backward compatibility: sin profile, usa los defaults históricos que
   * coinciden con el `equity` profile (proximity 3%, atr 1%, rb 1.5).
   */
  profile?: AssetProfile;
  /**
   * Flag EXPERIMENTAL (off por defecto): activa el branch LONG a favor de
   * tendencia (ver constantes MIN_FUERZA_LONG…). Se resuelve en compute.ts desde
   * `A3_LONG_TREND_FOLLOW`. Con el flag ausente/false, el compute es idéntico al
   * histórico (cero cambio de comportamiento). Mecanismo validado; rentabilidad NO.
   */
  enableLongTrendFollow?: boolean;
  /** Fuerza de tendencia (1-5). Solo la usa el branch long experimental. */
  fuerza?: number;
  /** SMA20 (de compute). Gate de "tendencia viva" del branch long (respaldo de sma50). */
  sma20?: number | null;
  /** SMA50 (de compute). Gate principal de "tendencia viva" del branch long. */
  sma50?: number | null;
  /** RSI14 (de compute). Techo anti blow-off del branch long. */
  rsi?: number | null;
}

/** R/B mínimo aceptable (default histórico — equity profile lo coincide). */
export const MIN_RB_RATIO = 1.5;
/** Datos insuficientes para emitir setup. */
export const MIN_CANDLES_FOR_SIGNAL = 20;
/** Proximidad al nivel para entrada a MERCADO ("ya está pegado"). */
const DEFAULT_PROXIMITY_PCT = 3;
/** Fallback de ATR como % del precio actual (default histórico). */
const DEFAULT_ATR_FALLBACK_PCT = 1;
/**
 * Alcanzabilidad de un nivel-disparador como múltiplo de ATR (ADR-002 fase 2).
 * Si el nivel está a más de REACH_ATR_MULT·ATR, el retroceso/avance hasta él es
 * fantasía dentro del horizonte → hold. Escala con la volatilidad vía ATR.
 */
export const REACH_ATR_MULT = 5;

// ── Branch LONG a favor de tendencia (EXPERIMENTAL, flag off por defecto) ──
// Diseñado para desbloquear compras en tendencia alcista incl. MÁXIMOS NUEVOS:
// entrada a mercado (distancia 0 → sin gate de alcanzabilidad) + target proyectado
// por ATR cuando no hay resistencia previa. Mecanismo VALIDADO (genera 43 longs/74
// vs 1 del branch de retroceso); su RENTABILIDAD NO está validada — el backtest no
// tiene horizonte ni benchmark para juzgarla (investigación 2026-07). Constantes v1.
export const MIN_FUERZA_LONG = 3; // fuerza mínima de tendencia (1-5): exige impulso real
const K_STOP = 1.5; // riesgo nominal en múltiplos de ATR
const TARGET_MIN_ATR = 2.7; // piso de distancia al target (ATR) → garantiza horizonte swing
const STRUCT_STOP_BUFFER = 0.25; // colchón (ATR) bajo el soporte usado como stop estructural
const RSI_MAX_LONG = 78; // techo anti blow-off (no entrar en clímax de compra)
const RB_EPS = 0.01; // tolerancia anti-redondeo del gate de R/B

/**
 * Operativa = plan geométrico (lógica histórica, intacta) + marcas shadow
 * F1/F1'/F2 calculadas POR CÓDIGO sobre ese plan. Las marcas no alteran
 * signal/entrada/stop/target/horizonte: son telemetría persistida para medir
 * los gates en producción sin filtrar nada (plan precisión 2026-09, §4 y §8).
 */
export function computeOperativa(input: OperativaInput): OperativaResult {
  const plan = computePlan(input);
  const currentPrice =
    input.candles.length > 0 ? input.candles[input.candles.length - 1]!.c : null;
  return {
    ...plan,
    veto_regimen: vetoRegimen(plan.signal, currentPrice, input.sma200 ?? null),
    distancia_entrada_atr: distanciaEntradaAtr(plan, currentPrice),
  };
}

/**
 * SHADOW TAG F1 (veto corto sobre SMA200) + F1' (espejo obligatorio):
 *   sell y precio > SMA200 → true · buy y precio < SMA200 → true
 *   a favor del régimen (o precio == SMA200) → false
 *   sin SMA200, sin precio, o hold → null (indeterminado, NO "conservado")
 */
export function vetoRegimen(
  signal: Signal_t,
  currentPrice: number | null,
  sma200: number | null
): boolean | null {
  if (signal === 'hold') return null;
  if (sma200 == null || !Number.isFinite(sma200)) return null;
  if (currentPrice == null || !Number.isFinite(currentPrice)) return null;
  if (signal === 'sell') return currentPrice > sma200;
  return currentPrice < sma200;
}

/**
 * SHADOW TAG F2: |entrada − precio actual| / ATR.
 *   market → 0 (la entrada ES el precio actual, por construcción)
 *   limit  → distancia en ATRs con el ATR real (`atr_actual`); null sin ATR
 *   hold / sin entrada → null
 * Usa `atr_actual` (el ATR crudo, el mismo que se persiste), no el fallback
 * porcentual del plan. Precio de referencia = cierre de la última vela (el
 * mismo `currentPrice` que usa `computePlan`), que puede diferir marginalmente
 * de `analyses_log.initial_price` (cotización en vivo con fallback al cierre):
 * la métrica se reproduce desde `a3_output` (entrada, atr_actual, última vela),
 * no desde `initial_price`.
 */
export function distanciaEntradaAtr(
  plan: Pick<OperativaPlan, 'signal' | 'entrada' | 'entry_type' | 'atr_actual'>,
  currentPrice: number | null
): number | null {
  if (plan.signal === 'hold' || plan.entrada == null || plan.entry_type == null) return null;
  if (plan.entry_type === 'market') return 0;
  const atr = plan.atr_actual;
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return null;
  if (currentPrice == null || !Number.isFinite(currentPrice)) return null;
  return Math.abs(plan.entrada - currentPrice) / atr;
}

function computePlan(input: OperativaInput): OperativaPlan {
  const { candles, tendencia, levels, atr, profile } = input;

  // Resolución de parámetros: profile si existe, default histórico si no.
  // Los defaults coinciden con el equity profile → tests existentes pasan.
  const proximityPct = profile?.proximity_pct ?? DEFAULT_PROXIMITY_PCT;
  const atrFallbackPct = profile?.atr_fallback_pct ?? DEFAULT_ATR_FALLBACK_PCT;
  const minRbRatio = profile?.min_rb_ratio ?? MIN_RB_RATIO;
  const round = (n: number) =>
    profile ? roundProfile(n, profile) : Math.round(n * 100) / 100;

  // Cadencia de las velas (≈1 para diario, ≈0.167 para 4H). Sirve para
  // (a) el fallback de horizonte sin target y (b) traducir estBars → estDays
  // en horizonteFromTarget. Se computa una vez (ADR-003, F8b).
  const intervalDays = medianIntervalDays(candles);

  // Regla 4 — datos insuficientes: no hay plan, el horizonte solo puede salir
  // del intervalo de las velas (nunca 'posicional' a ciegas).
  if (candles.length < MIN_CANDLES_FOR_SIGNAL) {
    return {
      signal: 'hold',
      entrada: null,
      stop_loss: null,
      target: null,
      atr_actual: atr,
      ratio_riesgo_beneficio: null,
      horizonte: horizonteFallback(intervalDays),
      entry_type: null,
    };
  }

  const currentPrice = candles[candles.length - 1]!.c;
  const effectiveATR = atr ?? currentPrice * (atrFallbackPct / 100);

  // Branch LONG a favor de tendencia (EXPERIMENTAL, flag off por defecto). Corre
  // ANTES del BUY por retroceso: en alcista intenta el largo a mercado (opera
  // máximos nuevos); si sus gates fallan → null → cae al resto de la lógica
  // histórica intacta. Con el flag off no se ejecuta → comportamiento idéntico.
  if (input.enableLongTrendFollow && tendencia === 'alcista') {
    const long = computeLongTrendFollow(input, {
      currentPrice,
      effectiveATR,
      minRbRatio,
      round,
      intervalDays,
    });
    if (long) return long;
  }

  // Caso BUY (alcista): plan largo en el soporte de abajo, target en la
  // resistencia. Entrada a MERCADO si el precio ya está pegado al soporte;
  // si no, LÍMITE en el soporte (esperar el retroceso) siempre que sea
  // alcanzable (≤ REACH_ATR_MULT·ATR). ADR-002 fase 2.
  if (tendencia === 'alcista' && levels.soportes.length > 0 && levels.resistencias.length > 0) {
    const support = levels.soportes[0]!;
    const resistance = levels.resistencias[0]!;
    const distToSupport = currentPrice - support; // soporte abajo → > 0

    if (distToSupport > 0 && resistance > currentPrice) {
      const proximityAbs = currentPrice * (proximityPct / 100);
      const reachAbs = REACH_ATR_MULT * effectiveATR;

      if (distToSupport <= reachAbs) {
        const entry_type: 'market' | 'limit' =
          distToSupport <= proximityAbs ? 'market' : 'limit';
        const entrada = entry_type === 'market' ? currentPrice : support;
        const stop_loss = round(support - effectiveATR);
        const target = round(resistance);
        const riesgo = entrada - stop_loss;
        const beneficio = target - entrada;

        if (riesgo > 0 && beneficio > 0) {
          const ratio = beneficio / riesgo;
          if (ratio >= minRbRatio) {
            return {
              signal: 'buy',
              entrada: round(entrada),
              stop_loss,
              target,
              atr_actual: atr,
              ratio_riesgo_beneficio: round(ratio),
              horizonte: horizonteFromTarget(entrada, target, effectiveATR, intervalDays),
              entry_type,
            };
          }
        }
      }
    }
  }

  // Caso SELL (bajista): plan corto en la resistencia de arriba, target en el
  // soporte. Mercado si el precio ya está pegado; si no, LÍMITE en la
  // resistencia (esperar el rebote) si es alcanzable. ADR-002 fase 2.
  if (tendencia === 'bajista' && levels.resistencias.length > 0 && levels.soportes.length > 0) {
    const resistance = levels.resistencias[0]!;
    const support = levels.soportes[0]!;
    const distToResistance = resistance - currentPrice; // resistencia arriba → > 0

    if (distToResistance > 0 && support < currentPrice) {
      const proximityAbs = currentPrice * (proximityPct / 100);
      const reachAbs = REACH_ATR_MULT * effectiveATR;

      if (distToResistance <= reachAbs) {
        const entry_type: 'market' | 'limit' =
          distToResistance <= proximityAbs ? 'market' : 'limit';
        const entrada = entry_type === 'market' ? currentPrice : resistance;
        const stop_loss = round(resistance + effectiveATR);
        const target = round(support);
        const riesgo = stop_loss - entrada;
        const beneficio = entrada - target;

        if (riesgo > 0 && beneficio > 0) {
          const ratio = beneficio / riesgo;
          if (ratio >= minRbRatio) {
            return {
              signal: 'sell',
              entrada: round(entrada),
              stop_loss,
              target,
              atr_actual: atr,
              ratio_riesgo_beneficio: round(ratio),
              horizonte: horizonteFromTarget(entrada, target, effectiveATR, intervalDays),
              entry_type,
            };
          }
        }
      }
    }
  }

  // Default: HOLD con niveles null (lateral, falta un nivel, R/B insuficiente,
  // o el nivel-disparador no es alcanzable dentro del horizonte). Sin target no
  // hay distancia que medir → horizonte por intervalo de las velas.
  return {
    signal: 'hold',
    entrada: null,
    stop_loss: null,
    target: null,
    atr_actual: atr,
    ratio_riesgo_beneficio: null,
    horizonte: horizonteFallback(intervalDays),
    entry_type: null,
  };
}

/**
 * Branch LONG a favor de tendencia (EXPERIMENTAL — Diseño A "híbrido").
 *
 * Ataca las dos asimetrías que hoy hacen que A3 casi nunca compre en tendencia
 * alcista (investigación 2026-07):
 *   1. Entrada a MERCADO (distancia 0) → sin gate de alcanzabilidad REACH_ATR_MULT
 *      y sin exigir un pullback lejano a contra-tendencia.
 *   2. Target HÍBRIDO: la resistencia más cercana si da R/B≥min; si NO hay
 *      resistencia arriba (máximos nuevos) → proyección por ATR (target = entrada +
 *      max(min_rb·K_STOP, TARGET_MIN_ATR)·ATR) → se puede comprar en máximos.
 * Stop = K_STOP·ATR, recortado a un soporte REAL si cae dentro de la banda
 * (preserva la "regla-2" del compute: stop al otro lado de un nivel técnico).
 *
 * Devuelve un plan 'buy' o null (gates no cumplidos → el caller cae a la lógica
 * histórica). Gates nullable-safe: si falta un indicador, NO bloquea por ese gate.
 */
function computeLongTrendFollow(
  input: OperativaInput,
  ctx: {
    currentPrice: number;
    effectiveATR: number;
    minRbRatio: number;
    round: (n: number) => number;
    intervalDays: number;
  }
): OperativaPlan | null {
  const { currentPrice, effectiveATR, minRbRatio, round, intervalDays } = ctx;
  const { fuerza, sma20, sma50, rsi, levels, atr } = input;

  // ── Gates de calidad ──
  if ((fuerza ?? 0) < MIN_FUERZA_LONG) return null;
  if (!Number.isFinite(effectiveATR) || effectiveATR <= 0) return null;
  // Tendencia viva: precio por encima de la media media (sma20 de respaldo).
  if (sma50 != null) {
    if (currentPrice <= sma50) return null;
  } else if (sma20 != null) {
    if (currentPrice <= sma20) return null;
  }
  // No sobre-extendido (evita comprar el clímax).
  if (rsi != null && rsi >= RSI_MAX_LONG) return null;

  // ── Geometría: entrada a mercado, stop k·ATR (recorte estructural), target híbrido ──
  const entrada = round(currentPrice);
  const atrStop = currentPrice - K_STOP * effectiveATR;
  // Soporte más alto que quede DENTRO de la banda (atrStop, precio): stop técnico más ajustado.
  const sIn = levels.soportes.filter((s) => s > atrStop && s < currentPrice);
  const stopRaw = sIn.length > 0 ? Math.max(...sIn) - STRUCT_STOP_BUFFER * effectiveATR : atrStop;
  const stop_loss = round(stopRaw);
  const risk = entrada - stop_loss;
  if (risk <= 0) return null;

  const resAbove = levels.resistencias.filter((r) => r > currentPrice);
  let target: number;
  if (resAbove.length > 0) {
    // Hay techo real → respétalo (no proyectar a través de un nivel de rechazo).
    const nearest = Math.min(...resAbove);
    if ((nearest - entrada) / risk >= minRbRatio) target = round(nearest);
    else return null; // techo demasiado cerca → no forzar el largo
  } else {
    // Máximos nuevos (sin resistencia) → proyección por ATR con piso swing.
    const distATR = Math.max(minRbRatio * K_STOP, TARGET_MIN_ATR);
    target = round(entrada + distATR * effectiveATR);
  }

  const beneficio = target - entrada;
  if (beneficio <= 0) return null;
  const rb = beneficio / risk;
  if (rb < minRbRatio - RB_EPS) return null; // guard anti-redondeo

  return {
    signal: 'buy',
    entrada,
    stop_loss,
    target,
    atr_actual: atr,
    ratio_riesgo_beneficio: round(rb),
    horizonte: horizonteFromTarget(entrada, target, effectiveATR, intervalDays),
    entry_type: 'market',
  };
}

/**
 * Horizonte estimado por la DISTANCIA AL TARGET en unidades de ATR (ADR-003,
 * F8b). Reemplaza al viejo `horizonteFromCandles`, que medía el SPAN total de
 * las velas (~1 año en prod) y por eso clavaba TODO en 'posicional'.
 *
 * Modelo (random-walk): el precio no avanza 1 ATR NETO por barra — bajo un
 * paseo aleatorio el desplazamiento neto esperado escala con √barras, así que
 * el tiempo esperado para recorrer K·ATR de distancia escala como ~K² barras
 * (NO lineal). Un modelo lineal (estBars = K) subestima el tiempo porque ignora
 * el vaivén. Por tanto:
 *   K       = |target − entrada| / ATR   (distancia en ATRs)
 *   estBars = K²
 *   estDays = estBars · intervalDays
 *
 * Umbrales alineados a las ventanas del backtest (evaluate-trades: swing=30d,
 * posicional=120d):
 *   estDays < 7   → 'intradia'
 *   7 ≤ estDays < 30 → 'swing'
 *   estDays ≥ 30  → 'posicional'
 *
 * Guard: ATR no positivo/no finito o entrada/target no finitos → no hay
 * distancia fiable que medir; cae al fallback por intervalo.
 */
export function horizonteFromTarget(
  entrada: number,
  target: number,
  atr: number,
  intervalDays: number
): TradingHorizon_t {
  if (
    !Number.isFinite(atr) ||
    atr <= 0 ||
    !Number.isFinite(entrada) ||
    !Number.isFinite(target)
  ) {
    return horizonteFallback(intervalDays);
  }
  const k = Math.abs(target - entrada) / atr;
  const estBars = k ** 2;
  const estDays = estBars * intervalDays;
  if (estDays < 7) return 'intradia';
  if (estDays < 30) return 'swing';
  return 'posicional';
}

/**
 * Fallback de horizonte por INTERVALO de las velas, para el branch HOLD / sin
 * target donde no hay distancia que medir. Default HONESTO: nunca 'posicional'
 * a ciegas (ese era el bug del span total).
 *   intervalDays < 1 (velas intradía, p.ej. 4H) → 'intradia'
 *   resto (gráfico diario o superior)           → 'swing'
 */
export function horizonteFallback(intervalDays: number): TradingHorizon_t {
  return intervalDays < 1 ? 'intradia' : 'swing';
}

/**
 * Cadencia de las velas en días: mediana de Δt entre velas consecutivas / 86400
 * (≈1 para diario, ≈0.167 para 4H). La mediana resiste huecos (fines de semana,
 * festivos) mejor que el span/N. Con < 2 velas asume 1 (diario).
 */
export function medianIntervalDays(candles: OHLCVCandle_t[]): number {
  if (candles.length < 2) return 1;
  const deltas: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    deltas.push(candles[i]!.t - candles[i - 1]!.t);
  }
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const medianSecs =
    deltas.length % 2 === 0 ? (deltas[mid - 1]! + deltas[mid]!) / 2 : deltas[mid]!;
  return medianSecs / 86400;
}
