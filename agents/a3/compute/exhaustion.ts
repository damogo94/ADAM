/**
 * A.D.A.M. — Detector de AGOTAMIENTO / blow-off (HIPÓTESIS CONGELADA · NO VALIDADO)
 *
 * ⚠️  ESTADO: NO VALIDADO. Código DORMIDO. NO está cableado a ningún path de
 *     decisión (computeOperativa NO lo llama). NO usarlo como veto ni como señal
 *     de trading hasta re-testearlo out-of-sample (ver "REACTIVACIÓN" abajo).
 *
 * QUÉ ES. Detector determinista OHLCV-only de clímax alcista (blow-off top),
 * pensado como señal de SALIDA/fade — la palanca #1 de la investigación 2026-07
 * sobre dónde tiene edge A3. La idea: A3 tiene edge probado en el LADO CORTO/
 * absoluto (etiqueta 'bajista' → −7.6% @30d, 76-80% caen); un detector de
 * agotamiento EXTENDERÍA ese edge (suprimir compras / armar fade en techos),
 * en vez de forzar un "alpha largo de exceso" que es INALCANZABLE con OHLCV-only
 * single-ticker (ceguera al benchmark — ver docs/adr/0004).
 *
 * CRITERIO PRE-REGISTRADO (umbrales a-priori, NO tuneados a ningún resultado):
 *   dispara si  close ≥ SMA20 + 1.5·ATR20   (sobre-extendido AL ALZA = contexto de techo)
 *   Y confluyen ≥2 de 4:
 *     - aceleración parabólica: ret(5 velas) > 5% Y > ret(5 velas previas)
 *     - expansión de rango:     ATR(5) / ATR(20) > 1.4
 *     - cierre débil:           close en el 40% inferior del rango de la vela (rechazo)
 *     - divergencia bajista de volumen (detectVolumeDivergence)
 *
 * POR QUÉ ESTÁ CONGELADO Y NO VALIDADO (decisión adversarial 2026-07, docs/adr/0004):
 *   Backtest sobre 373 análisis históricos → DISPARA 0 VECES. Diagnóstico de tasas
 *   base: solo 32/373 (9%) sobre-extendidos ≥1.5·ATR; expansión de rango 5/373 (1%);
 *   confluencia≥2 = 15/373 (4%); y los sobre-extendidos NO solapan con los de
 *   confluencia → 0. La mediana close−SMA20 de la muestra es −0.8 ATR (la mayoría
 *   cotiza POR DEBAJO de su media). CONCLUSIÓN: la muestra (un solo régimen bajista)
 *   NO CONTIENE techos de blow-off. El 0 es del DATO, no del código (lo demuestra el
 *   test de fixture sintético: exhaustion.test.ts). Recalibrar umbrales sobre esta
 *   muestra sería P-HACKING (fabricar señal donde el fenómeno no existe). Por eso se
 *   congela el spec tal cual, como hipótesis pendiente de datos.
 *
 * REACTIVACIÓN (condiciones para cablearlo como señal real, no antes):
 *   1. Muestra OUT-OF-SAMPLE multi-régimen que CONTENGA techos reales (mercado
 *      frothy/alcista), con varios tickers descorrelacionados.
 *   2. Medir su tasa de falsos positivos en AMBOS sentidos (dispara-y-no-cae /
 *      no-dispara-y-cae) sobre esa muestra, con los umbrales AQUÍ (sin re-tunear).
 *   3. Solo si discrimina de verdad → cablear como veto/fade detrás de flag y volver
 *      a backtestear el efecto end-to-end. Prohibido tunear sobre los 373 originales.
 *
 * AISLAMIENTO: OHLCV-only puro (SMA/ATR/rango/volumen del propio ticker). Respeta
 * el invariante de A3.
 */

import type { OHLCVCandle_t } from '@/agents/shared/types';
import { atrLast, smaLast } from './indicators';
import { detectVolumeDivergence } from './patterns';

export interface ExhaustionResult {
  /** true si el patrón de agotamiento (clímax alcista) está presente. */
  exhausted: boolean;
  /** nº de sub-criterios de confluencia cumplidos (0-4). Diagnóstico. */
  score: number;
  /** distancia close−SMA20 en múltiplos de ATR20 (>0 = por encima de la media). */
  overExtensionATR: number | null;
}

/** Umbrales pre-registrados (a-priori). NO tunear sobre la muestra actual (p-hacking). */
export const EXHAUSTION_OVEREXT_ATR = 1.5;
export const EXHAUSTION_ACCEL_RET5 = 0.05;
export const EXHAUSTION_RANGE_EXP = 1.4;
export const EXHAUSTION_WEAK_CLOSE = 0.4;
export const EXHAUSTION_MIN_SCORE = 2;

/**
 * Evalúa el agotamiento alcista sobre la serie de velas (usa el tail; espera
 * velas diarias). Función PURA. NO la consume el compute todavía (código dormido).
 */
export function detectExhaustion(candles: OHLCVCandle_t[]): ExhaustionResult {
  const none: ExhaustionResult = { exhausted: false, score: 0, overExtensionATR: null };
  if (candles.length < 60) return none;

  const n = candles.length;
  const last = candles[n - 1]!;
  const closes = candles.map((k) => k.c);
  const atr20 = atrLast(candles, 20);
  const atr5 = atrLast(candles, 5);
  const sma20 = smaLast(candles, 20);
  if (atr20 == null || atr5 == null || sma20 == null || atr20 <= 0) return none;

  const overExtensionATR = (last.c - sma20) / atr20;
  // Contexto obligatorio: sobre-extendido AL ALZA. Si no, no es un techo.
  if (overExtensionATR < EXHAUSTION_OVEREXT_ATR) {
    return { exhausted: false, score: 0, overExtensionATR };
  }

  const ret5 = (closes[n - 1]! - closes[n - 6]!) / closes[n - 6]!;
  const ret5prev = (closes[n - 6]! - closes[n - 11]!) / closes[n - 11]!;
  const accel = ret5 > EXHAUSTION_ACCEL_RET5 && ret5 > ret5prev;
  const rangeExp = atr5 / atr20 > EXHAUSTION_RANGE_EXP;
  const rng = last.h - last.l;
  const weakClose = rng > 0 && (last.c - last.l) / rng < EXHAUSTION_WEAK_CLOSE;
  const volDiv = detectVolumeDivergence(candles) === 'divergencia_bajista';

  const score = [accel, rangeExp, weakClose, volDiv].filter(Boolean).length;
  return { exhausted: score >= EXHAUSTION_MIN_SCORE, score, overExtensionATR };
}
