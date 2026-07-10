import type { StreamEvent } from './types';

/**
 * Instrumentación de timing por-card del run de /analysis (Fase 1 · D1).
 *
 * Es el PRIMER PASO de Fase 1: el perfil temporal de D1 es una ESTIMACIÓN estática
 * (reconstruida del código, no medida). Antes de fijar cualquier duración de motion
 * en el rediseño hero-led hay que medir los deltas percibidos REALES entre flips de
 * card, distinguiendo cache caliente (A2 primero) de fría (A2 tardío tras el resolve).
 *
 * Puro/aditivo: NO muta estado de React ni el stream; solo marca instantes y vuelca
 * un resumen a consola en desarrollo. En prod no imprime nada.
 */

export interface RunTimingMark {
  /** p.ej. 'agent:a1:done', 'debate:skipped', 'final', 'a2:cold-late'. */
  label: string;
  /** ms desde el arranque del run. */
  atMs: number;
}

export interface RunTiming {
  /** `performance.now()` en el momento de lanzar el run. */
  startedAt: number;
  marks: RunTimingMark[];
}

const DEV = process.env.NODE_ENV !== 'production';

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function round(n: number): number {
  return Math.round(n);
}

/** Abre una captura de timing (llamar al arrancar el run, junto al setState inicial). */
export function startRunTiming(): RunTiming {
  return { startedAt: now(), marks: [] };
}

/** Registra el instante de aterrizaje de un evento del stream NDJSON. */
export function markStreamEvent(t: RunTiming | null, ev: StreamEvent): void {
  if (!t) return;
  const label =
    ev.type === 'agent'
      ? `agent:${ev.agent}:${ev.status}`
      : ev.type === 'debate'
        ? `debate:${ev.status}`
        : ev.type; // 'final' | 'fatal'
  t.marks.push({ label, atMs: round(now() - t.startedAt) });
}

/** Marca genérica para aterrizajes fuera del stream (A2 tardío, Estructura). */
export function markRun(t: RunTiming | null, label: string): void {
  if (!t) return;
  t.marks.push({ label, atMs: round(now() - t.startedAt) });
}

/**
 * Vuelca el perfil real de aterrizaje a consola (solo dev). Con esto se calibran las
 * duraciones de `lib/motion` contra datos medidos en vez de las estimaciones de D1.
 */
export function logRunTiming(
  t: RunTiming | null,
  meta: { ticker: string | null; cache: 'hot' | 'cold-late' | 'no-a2' }
): void {
  if (!DEV || !t || t.marks.length === 0) return;
  const rows = t.marks.map((m, i) => {
    const prevAt = i === 0 ? 0 : (t.marks[i - 1]?.atMs ?? m.atMs);
    return {
      evento: m.label,
      't (ms)': m.atMs,
      'Δ prev (ms)': round(m.atMs - prevAt),
    };
  });
  /* eslint-disable no-console */
  console.groupCollapsed(
    `[vitality-timing] ${meta.ticker ?? '?'} · cache:${meta.cache} · ${t.marks.length} eventos`
  );
  console.table(rows);
  console.groupEnd();
  /* eslint-enable no-console */
}
