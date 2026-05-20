/**
 * Cliente FRED — Federal Reserve Economic Data
 *
 * Fuente oficial de macro US: Fed funds, treasury yields, CPI, unemployment,
 * VIX. Gratis con API key (registro en https://fred.stlouisfed.org/docs/api/).
 *
 * Diseñado defensivo: cada serie devuelve null si la respuesta no cumple
 * el shape esperado. El compositor en `lib/market/macro.ts` decide qué hacer
 * con los nulls (degradación graciosa hacia el edge case de A2).
 */

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredObservation {
  date: string; // 'YYYY-MM-DD'
  value: number | null;
}

/**
 * Lee las últimas N observaciones de una serie FRED en orden descendente
 * (más reciente primero). Filtra observaciones con valor '.' (FRED usa esto
 * para indicar dato indisponible).
 */
export async function fetchFredSeries(
  seriesId: string,
  limit = 13
): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[fred] FRED_API_KEY no definida — devolviendo array vacío');
    return [];
  }

  const url = new URL(FRED_BASE);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('limit', String(limit));

  try {
    const res = await fetch(url.toString(), {
      // Timeout corto: si FRED tarda >5s, abortamos y degradamos
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[fred] ${seriesId} HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { observations?: { date: string; value: string }[] };
    if (!Array.isArray(json.observations)) return [];
    return json.observations
      .map((o) => ({
        date: o.date,
        value: o.value === '.' || o.value === '' ? null : Number(o.value),
      }))
      .filter((o) => o.value === null || !Number.isNaN(o.value));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[fred] ${seriesId} fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/** Devuelve el último valor numérico (no-null) de la serie, o null. */
export function latestValue(obs: FredObservation[]): number | null {
  for (const o of obs) {
    if (o.value !== null) return o.value;
  }
  return null;
}
