/**
 * Estadística mínima y determinista para los harnesses de `scripts/` (ADR-0006).
 *
 * Todo es puro y sin dependencias: PRNG con semilla (mulberry32), bootstrap por
 * BLOQUES (clusters), IC percentil, p-valor one-sided por bootstrap y corrección
 * Holm-Bonferroni. Sin `Math.random` → misma semilla, mismos números.
 *
 * NO es código de aplicación: vive en scripts/lib (excluido del harness config,
 * cubierto por `pnpm test` vía scripts/lib/__tests__).
 */

/** PRNG determinista de 32 bits (mulberry32). Devuelve uniformes en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (a: number[]): number =>
  a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;

export const median = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
};

export const round = (n: number, d = 3): number =>
  Number.isFinite(n) ? Number(n.toFixed(d)) : n;

/** Cluster ticker × trimestre (UTC) para el bootstrap por bloques y el N efectivo. */
export function quarterCluster(ticker: string, ms: number): string {
  const d = new Date(ms);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${ticker}:${d.getUTCFullYear()}Q${q}`;
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * Bootstrap por bloques: re-muestrea los GRUPOS (clusters) con reemplazo,
 * concatena sus elementos y aplica `stat`. Devuelve las B réplicas del
 * estadístico (NaN si la réplica queda vacía). Determinista por semilla.
 */
export function blockBootstrap<T>(
  groups: T[][],
  stat: (items: T[]) => number,
  B: number,
  seed: number
): number[] {
  const rng = mulberry32(seed);
  const n = groups.length;
  const out: number[] = [];
  if (n === 0) return out;
  for (let b = 0; b < B; b++) {
    const items: T[] = [];
    for (let j = 0; j < n; j++) {
      const g = groups[Math.floor(rng() * n)]!;
      for (const it of g) items.push(it);
    }
    out.push(stat(items));
  }
  return out;
}

/** IC percentil (ignora NaN). */
export function percentileCI(samples: number[], level = 0.95): { lo: number; hi: number; n: number } {
  const s = samples.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return { lo: NaN, hi: NaN, n: 0 };
  const alpha = (1 - level) / 2;
  const at = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]!;
  return { lo: at(alpha), hi: at(1 - alpha), n: s.length };
}

/** p-valor one-sided (H1: estadístico > 0): (#{boot ≤ 0} + 1) / (B + 1). NaN cuenta como ≤ 0 (conservador). */
export function pOneSided(samples: number[]): number {
  if (!samples.length) return 1;
  const le = samples.filter((x) => !(x > 0)).length;
  return (le + 1) / (samples.length + 1);
}

export interface HolmResult {
  name: string;
  p: number;
  p_adj: number;
  reject: boolean;
}

/** Holm-Bonferroni (step-down). p_adj monótono no decreciente en el orden de p. */
export function holm(tests: { name: string; p: number }[], alpha = 0.05): HolmResult[] {
  const m = tests.length;
  const order = tests
    .map((t, idx) => ({ ...t, idx }))
    .sort((a, b) => a.p - b.p);
  const adj: number[] = new Array(m).fill(1);
  let running = 0;
  for (let i = 0; i < m; i++) {
    const t = order[i]!;
    const raw = Math.min(1, (m - i) * t.p);
    running = Math.max(running, raw);
    adj[t.idx] = running;
  }
  return tests.map((t, idx) => ({ name: t.name, p: t.p, p_adj: adj[idx]!, reject: adj[idx]! <= alpha }));
}
