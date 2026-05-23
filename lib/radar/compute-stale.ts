/**
 * `is_stale` — el último análisis está "viejo" según un umbral horario.
 *
 * Decisión C de FASE 0: 24h por defecto, configurable por env
 * `STALE_HOURS`. El UI degrada visualmente las filas con `is_stale=true`
 * para que el user no interprete una confluencia vieja como "en vivo".
 *
 * Función PURA — recibe `lastAnalysisAt` (ISO) y opcionalmente un `now`
 * inyectable (útil para tests deterministas). Lee el env una vez por
 * llamada para reflejar cambios sin restart durante dev (en prod el
 * proceso reinicia con el deploy de todos modos).
 */

const DEFAULT_STALE_HOURS = 24;

export function getStaleHours(): number {
  const raw = process.env.STALE_HOURS;
  if (!raw) return DEFAULT_STALE_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_STALE_HOURS;
  return n;
}

export function computeStale(
  lastAnalysisAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastAnalysisAt) return true;
  const created = new Date(lastAnalysisAt).getTime();
  if (!Number.isFinite(created)) return true;
  const ageMs = now.getTime() - created;
  if (ageMs < 0) return false; // futuro: lo tratamos como fresco (clock skew)
  const ageHours = ageMs / (3_600 * 1000);
  return ageHours > getStaleHours();
}
