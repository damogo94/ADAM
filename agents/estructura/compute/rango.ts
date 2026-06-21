/**
 * A.D.A.M. — Estructura · rango operativo y zona de retesteo
 *
 * Manual §1 ("El Rango Operativo y las Zonas de Valor"):
 *
 *   Alcista (buscando compras):
 *     rango = distancia entre el PENÚLTIMO alto y el ÚLTIMO alto.
 *     mecánica = esperar el retroceso al penúltimo alto (antigua resistencia,
 *     ahora soporte) y comprar, proyectando ruptura del último alto.
 *
 *   Bajista (buscando ventas):
 *     rango = distancia entre el PENÚLTIMO bajo y el ÚLTIMO bajo.
 *     mecánica = esperar el retroceso al penúltimo bajo (antiguo soporte,
 *     ahora resistencia) y vender, proyectando ruptura del último bajo.
 *
 * La zona de retesteo es una banda alrededor del nivel "rompe y apoya",
 * con amplitud `level_tolerance_pct` del profile (misma tolerancia que el
 * clustering de niveles de A3).
 */

import { roundProfile, type AssetProfile } from '@/agents/a3/profiles';
import type { LecturaTimeframe_t, RangoOperativo_t } from '../schema';

/**
 * Calcula el rango operativo y la zona de retesteo a partir de la lectura
 * estructural de un timeframe (típicamente Daily, el "terreno de juego").
 * Lateral o sin extremos suficientes → rango con nulls y zona null.
 */
export function computeRango(
  lectura: LecturaTimeframe_t,
  profile: AssetProfile
): RangoOperativo_t {
  const round = (n: number) => roundProfile(n, profile);
  const tol = profile.level_tolerance_pct / 100;

  if (
    lectura.direccion === 'alcista' &&
    lectura.penultimo_alto != null &&
    lectura.ultimo_alto != null
  ) {
    const desde = lectura.penultimo_alto;
    const hasta = lectura.ultimo_alto;
    const nivel = desde; // penúltimo alto = antigua resistencia, ahora soporte
    return {
      desde,
      hasta,
      amplitud: round(Math.abs(hasta - desde)),
      zona_retesteo: {
        nivel,
        min: round(nivel * (1 - tol)),
        max: round(nivel * (1 + tol)),
        descripcion:
          'Retesteo del penúltimo alto (antigua resistencia, ahora soporte) — zona de compra.',
      },
    };
  }

  if (
    lectura.direccion === 'bajista' &&
    lectura.penultimo_bajo != null &&
    lectura.ultimo_bajo != null
  ) {
    const desde = lectura.penultimo_bajo;
    const hasta = lectura.ultimo_bajo;
    const nivel = desde; // penúltimo bajo = antiguo soporte, ahora resistencia
    return {
      desde,
      hasta,
      amplitud: round(Math.abs(hasta - desde)),
      zona_retesteo: {
        nivel,
        min: round(nivel * (1 - tol)),
        max: round(nivel * (1 + tol)),
        descripcion:
          'Retesteo del penúltimo bajo (antiguo soporte, ahora resistencia) — zona de venta.',
      },
    };
  }

  return { desde: null, hasta: null, amplitud: null, zona_retesteo: null };
}

/** True si `price` está dentro de la banda de la zona de retesteo. */
export function enZona(price: number, rango: RangoOperativo_t): boolean {
  const z = rango.zona_retesteo;
  if (!z) return false;
  return price >= z.min && price <= z.max;
}
