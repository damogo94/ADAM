/**
 * A.D.A.M. — Estructura · lectura estructural de un timeframe
 *
 * Manual §1: "Identificar PENÚLTIMO Y ÚLTIMO alto/bajo y el último impulso
 * dominante. Identificar si estamos en un impulso o un retroceso."
 *
 * Reutiliza el motor de A3:
 *   - `findSwingPoints()` → pivots confirmados (penúltimo/último alto y bajo)
 *   - `detectTrend()`     → dirección por estructura HH/HL vs LH/LL
 *
 * La FASE (impulso vs retroceso) se deriva de la posición del precio actual
 * dentro de la última pierna [último_bajo, último_alto]:
 *   - alcista: precio en la mitad alta → impulso; en la baja → retroceso (pullback)
 *   - bajista: precio en la mitad baja → impulso; en la alta → retroceso (pullback)
 * Esto es exactamente lo que la estrategia busca: el retroceso es la zona de
 * compra/venta ("rompe y apoya").
 */

import { findSwingPoints, detectTrend } from '@/agents/a3/compute/trend';
import { roundProfile, type AssetProfile } from '@/agents/a3/profiles';
import type { OHLCVCandle_t } from '@/agents/shared/types';
import type {
  EstructuraTimeframe_t,
  FaseEstructura_t,
  LecturaTimeframe_t,
} from '../schema';

/** Ventana de pivots por timeframe: más ancha en TFs altos (menos ruido). */
function pivotWindow(tf: EstructuraTimeframe_t): number {
  switch (tf) {
    case '1W':
      return 2; // pocas velas semanales → ventana corta
    case '1D':
      return 4;
    case '4H':
      return 3;
    case '1H':
    default:
      return 3;
  }
}

/**
 * Lee la estructura de un timeframe. Si no hay velas o son insuficientes
 * devuelve una lectura `lateral/indefinido` con extremos null (no lanza).
 */
export function readStructure(
  candles: OHLCVCandle_t[] | null | undefined,
  timeframe: EstructuraTimeframe_t,
  profile: AssetProfile
): LecturaTimeframe_t {
  const velas = candles?.length ?? 0;
  const vacio: LecturaTimeframe_t = {
    timeframe,
    direccion: 'lateral',
    fase: 'indefinido',
    penultimo_alto: null,
    ultimo_alto: null,
    penultimo_bajo: null,
    ultimo_bajo: null,
    velas_analizadas: velas,
  };
  if (!candles || velas < 10) return vacio;

  const round = (n: number) => roundProfile(n, profile);
  const swings = findSwingPoints(candles, pivotWindow(timeframe));
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');

  const ultimo_alto = highs.length >= 1 ? round(highs[highs.length - 1]!.price) : null;
  const penultimo_alto = highs.length >= 2 ? round(highs[highs.length - 2]!.price) : null;
  const ultimo_bajo = lows.length >= 1 ? round(lows[lows.length - 1]!.price) : null;
  const penultimo_bajo = lows.length >= 2 ? round(lows[lows.length - 2]!.price) : null;

  const direccion = detectTrend(candles).primaria;
  const price = candles[candles.length - 1]!.c;
  const fase = computeFase(direccion, price, ultimo_alto, ultimo_bajo);

  return {
    timeframe,
    direccion,
    fase,
    penultimo_alto,
    ultimo_alto,
    penultimo_bajo,
    ultimo_bajo,
    velas_analizadas: velas,
  };
}

/**
 * Impulso vs retroceso por posición del precio en la última pierna.
 * Punto medio de [último_bajo, último_alto] como umbral.
 */
export function computeFase(
  direccion: LecturaTimeframe_t['direccion'],
  price: number,
  ultimo_alto: number | null,
  ultimo_bajo: number | null
): FaseEstructura_t {
  if (direccion === 'lateral' || ultimo_alto == null || ultimo_bajo == null) {
    return 'indefinido';
  }
  if (ultimo_alto <= ultimo_bajo) return 'indefinido'; // estructura degenerada
  const mid = (ultimo_alto + ultimo_bajo) / 2;
  if (direccion === 'alcista') return price >= mid ? 'impulso' : 'retroceso';
  // bajista
  return price <= mid ? 'impulso' : 'retroceso';
}
