/**
 * Macro snapshot — composición + cache diario.
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
 * Failure modes:
 *   - FRED no responde → devuelve payload con nulls; A2 caerá en su edge case
 *     y emitirá confidence ≤ 20 (comportamiento ya existente y deseado).
 *   - DB down → fallback a fetch directo sin cache.
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
 * Cara pública: devuelve el snapshot del día. Lee cache si existe, si no
 * lo construye desde FRED y lo persiste.
 */
export async function getMacroSnapshot(): Promise<MacroSnapshotPayload> {
  const asOf = todayISODate();

  // 1. Intento de cache hit
  try {
    const admin = createSupabaseAdmin();
    // Tabla nueva (migración 0003) — no está en Database types regenerados aún.
    // Cast a any consistente con resto del codebase (memory: postgrest-js 2.x).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from('macro_snapshots_cache' as any) as any)
      .select('payload')
      .eq('as_of', asOf)
      .maybeSingle();
    if (!error && data?.payload) {
      return data.payload as MacroSnapshotPayload;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[macro] cache read failed, fetching fresh:', err instanceof Error ? err.message : err);
  }

  // 2. Cache miss → fetch + persist (best-effort)
  const snapshot = await buildMacroSnapshot(asOf);
  try {
    const admin = createSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('macro_snapshots_cache' as any) as any).upsert({
      as_of: asOf,
      payload: snapshot,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[macro] cache write failed:', err instanceof Error ? err.message : err);
  }
  return snapshot;
}
