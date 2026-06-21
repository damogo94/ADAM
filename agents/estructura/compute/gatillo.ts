/**
 * A.D.A.M. — Estructura · patrones de confirmación / gatillo (manual §5)
 *
 * Para abrir posición, la temporalidad de confirmación debe mostrar UNA de:
 *
 *   - Patrón "M" (doble techo) → reversión alcista→bajista (gatillo de VENTA).
 *   - Patrón "W" (doble suelo) → reversión bajista→alcista (gatillo de COMPRA).
 *   - Ruptura del impulso dominante: una vela de CUERPO FUERTE que quiebra el
 *     punto desde el que arrancó el impulso (penúltimo alto para compras,
 *     penúltimo bajo para ventas).
 *
 * Reutiliza `detectPattern()` de A3 para M/W; la ruptura de impulso es una
 * regla local sobre la última vela.
 */

import { detectPattern } from '@/agents/a3/compute/patterns';
import type { OHLCVCandle_t } from '@/agents/shared/types';
import type { DireccionSetup_t, Gatillo_t } from '../schema';

/** Cuerpo mínimo (fracción del rango) para considerar la vela "fuerte". */
const CUERPO_FUERTE = 0.6;

/**
 * Detecta el gatillo en las velas de la temporalidad de entrada.
 *
 * @param candles    Velas del timeframe de entrada (las más recientes al final).
 * @param direccion  Dirección operativa esperada por la estructura.
 * @param breakLevel Punto de arranque del impulso a quebrar (penúltimo alto
 *                   para compra, penúltimo bajo para venta). null → no se
 *                   evalúa ruptura.
 */
export function detectGatillo(
  candles: OHLCVCandle_t[] | null | undefined,
  direccion: DireccionSetup_t,
  breakLevel: number | null
): Gatillo_t {
  if (!candles || candles.length < 5 || direccion === 'ninguno') return 'ninguno';

  // 1) Patrón M / W (reutiliza A3).
  const patron = detectPattern(candles).patron_detectado;
  if (direccion === 'venta' && patron === 'doble techo') return 'M';
  if (direccion === 'compra' && patron === 'doble suelo') return 'W';

  // 2) Ruptura del impulso dominante con cuerpo fuerte.
  if (breakLevel != null) {
    const last = candles[candles.length - 1]!;
    const range = last.h - last.l;
    if (range > 0) {
      const cuerpo = Math.abs(last.c - last.o) / range;
      const fuerte = cuerpo >= CUERPO_FUERTE;
      const alcista = last.c > last.o;
      if (direccion === 'compra' && fuerte && alcista && last.c > breakLevel) {
        return 'ruptura_impulso';
      }
      if (direccion === 'venta' && fuerte && !alcista && last.c < breakLevel) {
        return 'ruptura_impulso';
      }
    }
  }

  return 'ninguno';
}
