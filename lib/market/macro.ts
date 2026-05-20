/**
 * Macro snapshot — composición + cache diario con stale fallback.
 *
 * Reemplaza el `macro_snapshot: {}` vacío que llegaba a A2 desde
 * /api/agents/run. Devuelve un payload con datos reales de FRED:
 *   - fed_funds_rate_pct, us_10y_yield_pct, us_2y_yield_pct
 *   - cpi_yoy_pct, cpi_trend
 *   - unemployment_pct, vix
 *   - curva_invertida (10Y - 2Y < 0)
 *   - as_of (fecha del compute)
 *
 * Cache: una fila por día en `macro_snapshots_cache`. Primera llamada del día
 * → fetch FRED + persiste. Resto del día → lee cache.
 *
 * Failure modes y resilience (hotfix v1.1):
 *   1. FRED responde con datos → persist + return. Normal.
 *   2. FRED no responde / sin API key → fetch devuelve todo null.
 *      Antes: persistía el null y quedaba atascado TODO el día.
 *      Ahora: NO persiste vacío + busca last-known-good en cache
 *      (hasta MAX_STALE_DAYS días atrás) y devuelve eso. El A2 ve datos
 *      reales (aunque stale) en vez de caer al edge case.
 *   3. DB down → fallback a fetch directo sin cache (igual que antes).
 *   4. Nada en cache + FRED tampoco → devuelve null pero NO persiste, así
 *      la próxima petición vuelve a intentar.
 */

import { fetchFredSeries, latestValue, type FredObservation } from './fred';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface MacroSnapshotPayload {
  fed_funds_rate_pct: number | null;
  us_10y_yield_pct: number | null;
  us_2y_yield_pct: number | null;
  cpi_yoy_pct: number | null;
  cpi_trend: 'subiendo' | 'estable' | 'bajando' | null;
  unemployment_pct: number | null;
  vix: number | null;
  curva_invertida: boolean | null;
  as_of: string; // 'YYYY-MM-DD'
}

const SERIES = {
  FED_FUNDS: 'DFF', // Daily effective federal funds rate
  T10Y: 'DGS10', // 10-Year Treasury Constant Maturity Rate
  T2Y: 'DGS2', // 2-Year Treasury Constant Maturity Rate
  CPI: 'CPIAUCSL', // CPI All Urban Consumers, seasonally adjusted (monthly)
  UNEMP: 'UNRATE', // Civilian Unemployment Rate (monthly)
  VIX: 'VIXCLS', // CBOE Volatility Index (daily)
} as const;

/**
 * Calcula CPI YoY a partir de las últimas observaciones mensuales.
 * Recibe array descendente (FRED limit=13 + sort_order=desc → meses recientes
 * primero). YoY = (latest / latest_minus_12_months - 1) × 100.
 */
export function computeCpiYoy(obs: FredObservation[]): number | null {
  if (obs.length < 13) return null;
  const latest = obs[0]?.value;
  const yearAgo = obs[12]?.value;
  if (latest == null || yearAgo == null || yearAgo === 0) return null;
  return ((latest / yearAgo) - 1) * 100;
}

/**
 * Determina trend de inflación comparando los últimos 3 CPI YoY consecutivos.
 * Si los tres últimos YoY van bajando monotónicamente → 'bajando'. Si suben
 * → 'subiendo'. Si oscilan o variación < 0.1pp → 'estable'.
 *
 * Necesita >= 15 observaciones para calcular 3 YoY consecutivos (mes M, M-1,
 * M-2 contra M-12, M-13, M-14).
 */
export function computeCpiTrend(
  obs: FredObservation[]
): 'subiendo' | 'estable' | 'bajando' | null {
  if (obs.length < 15) return null;
  const yoys: number[] = [];
  for (let i = 0; i < 3; i++) {
    const latest = obs[i]?.value;
    const yearAgo = obs[i + 12]?.value;
    if (latest == null || yearAgo == null || yearAgo === 0) return null;
    yoys.push(((latest / yearAgo) - 1) * 100);
  }
  // yoys[0] = mes actual, yoys[2] = hace 2 meses
  const delta = yoys[0]! - yoys[2]!;
  if (Math.abs(delta) < 0.1) return 'estable';
  return delta > 0 ? 'subiendo' : 'bajando';
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compone el snapshot consultando FRED en paralelo. NO consulta cache —
 * uso interno y para tests. La cara pública es `getMacroSnapshot()`.
 */
export async function buildMacroSnapshot(
  asOf: string = todayISODate()
): Promise<MacroSnapshotPayload> {
  const [fedFunds, t10y, t2y, cpi, unemp, vix] = await Promise.all([
    fetchFredSeries(SERIES.FED_FUNDS, 5),
    fetchFredSeries(SERIES.T10Y, 5),
    fetchFredSeries(SERIES.T2Y, 5),
    fetchFredSeries(SERIES.CPI, 15), // 15 para poder calcular trend
    fetchFredSeries(SERIES.UNEMP, 3),
    fetchFredSeries(SERIES.VIX, 5),
  ]);

  const t10 = latestValue(t10y);
  const t2 = latestValue(t2y);
  const curva_invertida =
    t10 != null && t2 != null ? t10 - t2 < 0 : null;

  return {
    fed_funds_rate_pct: latestValue(fedFunds),
    us_10y_yield_pct: t10,
    us_2y_yield_pct: t2,
    cpi_yoy_pct: computeCpiYoy(cpi),
    cpi_trend: computeCpiTrend(cpi),
    unemployment_pct: latestValue(unemp),
    vix: latestValue(vix),
    curva_invertida,
    as_of: asOf,
  };
}

/**
 * Edad máxima del último snapshot "bueno" reutilizable cuando FRED falla.
 * Más allá de esto, los datos son demasiado viejos para considerarlos
 * representativos del régimen macro actual — A2 cae al edge case (mejor
 * que mentir con datos de hace un mes).
 */
const MAX_STALE_DAYS = 7;

/**
 * Considera el snapshot "vacío" si los 6 indicadores principales (los que
 * mueven la narrativa de A2) están todos null. Sirve para decidir si:
 *  - persistir al cache (no si vacío)
 *  - reintentar fetch (sí si lo cacheado está vacío)
 *  - aceptar como respuesta (no — buscar stale fallback)
 *
 * `as_of` y `curva_invertida` se ignoran porque son derivados; pueden
 * existir aunque todo lo demás falle.
 */
export function isEffectivelyEmpty(s: MacroSnapshotPayload): boolean {
  return (
    s.fed_funds_rate_pct == null &&
    s.us_10y_yield_pct == null &&
    s.us_2y_yield_pct == null &&
    s.cpi_yoy_pct == null &&
    s.unemployment_pct == null &&
    s.vix == null
  );
}

/**
 * Busca en cache el último snapshot no-vacío dentro de MAX_STALE_DAYS.
 * Devuelve null si no hay nada utilizable.
 */
async function getLatestNonEmptyCached(): Promise<MacroSnapshotPayload | null> {
  try {
    const admin = createSupabaseAdmin();
    const cutoffISO = new Date(Date.now() - MAX_STALE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from('macro_snapshots_cache' as any) as any)
      .select('payload, as_of')
      .gte('as_of', cutoffISO)
      .order('as_of', { ascending: false })
      .limit(MAX_STALE_DAYS + 1);
    if (error || !data) return null;
    for (const row of data as { payload: MacroSnapshotPayload; as_of: string }[]) {
      if (!isEffectivelyEmpty(row.payload)) return row.payload;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[macro] stale lookup failed:',
      err instanceof Error ? err.message : err
    );
  }
  return null;
}

/**
 * Cara pública: devuelve el snapshot más útil disponible.
 * Orden de preferencia:
 *   1. Cache de hoy si existe y NO está vacío
 *   2. Fresh fetch a FRED si trae al menos un valor → persist + return
 *   3. Último snapshot no-vacío en cache (hasta MAX_STALE_DAYS atrás)
 *   4. Vacío (no persistido — la siguiente petición reintentará)
 */
export async function getMacroSnapshot(): Promise<MacroSnapshotPayload> {
  const asOf = todayISODate();

  // 1. Cache hit hoy — solo si NO está vacío. Si está vacío, lo ignoramos
  // y seguimos al fetch fresh (evita que un día de FRED caído atasque la
  // app hasta medianoche).
  try {
    const admin = createSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from('macro_snapshots_cache' as any) as any)
      .select('payload')
      .eq('as_of', asOf)
      .maybeSingle();
    if (!error && data?.payload) {
      const cached = data.payload as MacroSnapshotPayload;
      if (!isEffectivelyEmpty(cached)) return cached;
      // Cached pero vacío → cae al path de refetch
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[macro] cache read failed, fetching fresh:', err instanceof Error ? err.message : err);
  }

  // 2. Cache miss / cache vacío → fetch FRED
  const fresh = await buildMacroSnapshot(asOf);
  if (!isEffectivelyEmpty(fresh)) {
    // Persistir solo cuando hay datos reales — never persist empty
    try {
      const admin = createSupabaseAdmin();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from('macro_snapshots_cache' as any) as any).upsert({
        as_of: asOf,
        payload: fresh,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[macro] cache write failed:', err instanceof Error ? err.message : err);
    }
    return fresh;
  }

  // 3. Fresh vacío → fallback a último snapshot bueno reciente.
  // Mantiene el `as_of` original del dato cacheado (no miente al A2 sobre
  // la fecha) — A2 puede comentar en su narrativa que los datos son de
  // hace X días sin que tengamos que añadir un flag stale al schema.
  const stale = await getLatestNonEmptyCached();
  if (stale) {
    // eslint-disable-next-line no-console
    console.warn(
      `[macro] FRED vacío para ${asOf}, sirviendo last-known-good de ${stale.as_of}`
    );
    return stale;
  }

  // 4. Sin nada. Devolvemos vacío SIN persistir — la próxima petición
  // reintentará desde cero. A2 entra en su edge case ya conocido.
  return fresh;
}
