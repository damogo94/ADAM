/**
 * A.D.A.M. — SSOT de PRESENTACIÓN del horizonte temporal.
 *
 * Esta es la ÚNICA capa de traducción enum→etiqueta legible. El resto de la app
 * (UI/historial) NUNCA debe imprimir el valor crudo del enum `TradingHorizon`
 * (`intradia`/`swing`/`posicional`) — pasa por `horizonteLabel()`.
 *
 * IMPORTANTE: el enum interno NO se renombra. Sus literales están hardcodeados en
 * el filtro del backtest (`evaluate-trades`, que solo evalúa swing/posicional) y
 * en la persistencia de A3; cambiarlos rompería esa lógica en silencio. Aquí solo
 * traducimos a etiquetas HONESTAS de cara al usuario (decisión de producto ADR-003):
 * el horizonte es una ventana estimada, no una promesa exacta de duración.
 *
 * Importa el tipo desde `@/agents/shared/types` (SSOT de esquemas) — NO lo
 * redefine, para que cualquier cambio del enum rompa aquí en compile-time.
 */

import type { TradingHorizon_t } from '@/agents/shared/types';

/**
 * Etiqueta de presentación de un horizonte operativo.
 *   - `short`: forma compacta para donde el espacio escasea (filas de lista).
 *   - `long`: forma legible + honesta para banners/detalle.
 *
 * Mapeo canónico (ADR-003):
 *   intradia   → { short: '1d', long: '1 día · intradía' }
 *   swing      → { short: '7d', long: '1 semana · swing' }
 *   posicional → { short: '1M', long: 'posición · ≈1 mes+' }
 */
export function horizonteLabel(h: TradingHorizon_t): { short: string; long: string } {
  switch (h) {
    case 'intradia':
      return { short: '1d', long: '1 día · intradía' };
    case 'swing':
      return { short: '7d', long: '1 semana · swing' };
    case 'posicional':
      return { short: '1M', long: 'posición · ≈1 mes+' };
    default: {
      // Exhaustividad: si se añade un valor al enum sin actualizar este mapeo,
      // TS marca el `never` en compile-time. En runtime, fallback neutro.
      const _exhaustive: never = h;
      void _exhaustive;
      return { short: '—', long: 'horizonte' };
    }
  }
}

/**
 * Mapea el `timeframe_entrada` de Estructura (literales `EstructuraTimeframe`:
 * '1H' | '4H' | '1D' | '1W', normalizados a mayúsculas) al horizonte operativo:
 *   - 1H / 4H → intradía
 *   - 1D      → swing
 *   - 1W      → posicional
 *
 * Devuelve `null` si el timeframe es null/undefined o no se reconoce.
 */
export function horizonteFromEstructuraTimeframe(
  tf: string | null | undefined
): TradingHorizon_t | null {
  if (tf == null) return null;
  switch (tf.toUpperCase()) {
    case '1H':
    case '4H':
      return 'intradia';
    case '1D':
      return 'swing';
    case '1W':
      return 'posicional';
    default:
      return null;
  }
}
