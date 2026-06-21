/**
 * A.D.A.M. — Muros de opciones vanilla · interfaz pluggable
 *
 * El manual operativo (§3, "Eje Y") exige confirmar el nivel estructural
 * contra un MURO DE OPCIONES VANILLA: un strike con gran Open Interest que
 * actúa de imán/barrera para el precio.
 *
 * PROBLEMA (Fase 1): ADAM no tiene ninguna fuente de datos de opciones
 * (Yahoo/Finnhub free no dan option chain). Además XAU/USD spot no tiene
 * opciones listadas (están en el futuro GC / el ETF GLD) y NAS100 mapea a
 * NDX/QQQ. Por eso, en Fase 1:
 *
 *   - Los NÚMEROS REDONDOS (00/50) hacen de proxy de confluencia (manual §3
 *     ya los lista como pilar independiente).
 *   - `barrera_vanilla` viaja como `null` y `vanilla_disponible = false`.
 *
 * Esta interfaz es el HUECO LIMPIO para enchufar, sin reescribir nada, un
 * proveedor real de open interest (Fase 3) — o una entrada manual de muros.
 * El compute consume `VanillaWall[] | null`; hoy nadie lo pobla.
 */

/** Un muro de opciones: strike + Open Interest (contratos abiertos). */
export interface VanillaWall {
  /** Precio (strike) del muro. */
  strike: number;
  /** Open Interest en el strike (mayor = muro más fuerte). Opcional. */
  open_interest?: number;
  /** 'call' | 'put' | 'net' — tipo del muro, si se conoce. */
  tipo?: 'call' | 'put' | 'net';
}

/**
 * Devuelve el muro más cercano a `nivel` dentro de una banda `tolerancePct`,
 * o `null` si no hay muros (Fase 1) o ninguno cae dentro de la banda.
 *
 * Determinista: ante empate de distancia, gana el de mayor Open Interest;
 * si tampoco hay OI, el de menor strike (orden estable).
 */
export function nearestVanillaWall(
  nivel: number,
  walls: VanillaWall[] | null | undefined,
  tolerancePct: number
): VanillaWall | null {
  if (!walls || walls.length === 0 || !Number.isFinite(nivel) || nivel <= 0) {
    return null;
  }
  const banda = nivel * (tolerancePct / 100);
  const dentro = walls.filter((w) => Math.abs(w.strike - nivel) <= banda);
  if (dentro.length === 0) return null;

  return dentro.reduce((best, w) => {
    const dBest = Math.abs(best.strike - nivel);
    const dW = Math.abs(w.strike - nivel);
    if (dW < dBest) return w;
    if (dW > dBest) return best;
    // Empate de distancia → mayor OI, luego menor strike (estable).
    const oiBest = best.open_interest ?? 0;
    const oiW = w.open_interest ?? 0;
    if (oiW > oiBest) return w;
    if (oiW < oiBest) return best;
    return w.strike < best.strike ? w : best;
  });
}
