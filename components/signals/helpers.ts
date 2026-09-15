import type { SignalHistory, SignalTradeOutcome } from '@/types/db';
import { inferSignalDirection } from '@/lib/backtest/signal-plan';

/** Señal + outcome de trade (null = en seguimiento / no seguida). */
export type SignalWithOutcome = SignalHistory & { outcome: SignalTradeOutcome | null };

// ── Clusters (n efectivo) ────────────────────────────────────────────────────
// Las tasas "por fila" están infladas por la reemisión diaria: el cron cmt/scan
// vuelve a emitir la misma señal (mismo ticker, misma dirección, mismo nivel)
// cada noche mientras el setup sigue vivo, y el cron watchlist-scan re-analiza
// el mismo ticker a diario. Un cluster colapsa esas filas en UNA observación.
//
// Definición PROVISIONAL (plan de precisión 2026-09 · R9): el owner debe fijar
// gap (3 ó 4 días) y tolerancia (±1%) antes de aplicarla a datos nuevos y
// documentarla en ADR-003. Hasta entonces el parámetro vive aquí, exportado,
// para que calibración (/api/metrics/calibration) y track record CMT usen el
// MISMO valor.
/** Gap máximo (días) entre una fila y la ANTERIOR del cluster. Pendiente de fijar por el owner. */
export const CLUSTER_GAP_DAYS = 3;
/** Tolerancia de entrada (±%) respecto a la fila MÁS ANTIGUA del cluster (solo CMT). */
export const CLUSTER_ENTRY_TOLERANCE_PCT = 1;

const DAY_MS = 86_400_000;

export interface ClusterByGapOptions<T> {
  /** Clave gruesa de agrupación (ticker, ticker+dirección…). null → la fila no se clusteriza. */
  keyOf: (item: T) => string | null;
  /** Timestamp (ms) de la fila. NaN → la fila no se clusteriza. */
  timeOf: (item: T) => number;
  /**
   * Criterio fino opcional: ¿`next` pertenece al cluster cuya fila más antigua es
   * `first`? (p.ej. entrada ±1%). Se evalúa además del gap temporal.
   */
  joins?: (first: T, next: T) => boolean;
  /** Gap máximo en días respecto a la fila anterior del cluster. Default CLUSTER_GAP_DAYS. */
  gapDays?: number;
}

/**
 * Agrupa filas en clusters por clave + cadena temporal: dentro de una clave, las
 * filas se ordenan por tiempo y cada fila se une al cluster abierto si dista
 * ≤ gapDays de la fila ANTERIOR del cluster (regla de cadena: días 1,2,3 forman
 * un cluster aunque 1→3 sean 2 días; 3→10 lo rompe) y, si hay `joins`, si
 * además cumple el criterio fino contra la PRIMERA fila del cluster.
 *
 * Devuelve clusters con sus filas en orden ascendente de tiempo (índice 0 = la
 * más antigua = fila representativa). Filas sin clave o sin tiempo se omiten.
 */
export function clusterByGap<T>(items: T[], opts: ClusterByGapOptions<T>): T[][] {
  const gapMs = (opts.gapDays ?? CLUSTER_GAP_DAYS) * DAY_MS;
  const byKey = new Map<string, { item: T; t: number }[]>();
  for (const item of items) {
    const key = opts.keyOf(item);
    const t = opts.timeOf(item);
    if (key == null || !Number.isFinite(t)) continue;
    const arr = byKey.get(key) ?? [];
    arr.push({ item, t });
    byKey.set(key, arr);
  }
  const clusters: T[][] = [];
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.t - b.t);
    let current: { items: T[]; first: T; lastT: number } | null = null;
    for (const { item, t } of arr) {
      const chained =
        current != null &&
        t - current.lastT <= gapMs &&
        (opts.joins ? opts.joins(current.first, item) : true);
      if (chained && current) {
        current.items.push(item);
        current.lastT = t;
      } else {
        current = { items: [item], first: item, lastT: t };
        clusters.push(current.items);
      }
    }
  }
  return clusters;
}

/** Dirección de una señal CMT desde la geometría de niveles (SSOT: signal-plan). */
function signalDirection(s: SignalWithOutcome): 'buy' | 'sell' | null {
  if (s.entry_price != null && s.stop_loss != null && s.target_price != null) {
    return inferSignalDirection(s.entry_price, s.stop_loss, s.target_price);
  }
  // Fallback: la dirección que persistió el evaluador (si la fila ya se evaluó).
  const d = s.outcome?.direction;
  return d === 'buy' || d === 'sell' ? d : null;
}

/**
 * Clusters de señales CMT: mismo ticker + misma dirección + entrada dentro de
 * ±CLUSTER_ENTRY_TOLERANCE_PCT de la fila más antigua + ≤CLUSTER_GAP_DAYS respecto
 * a la fila anterior (por `emitted_at`). Señales sin dirección inferible o sin
 * entrada quedan fuera (no se clusterizan).
 */
export function clusterSignals(signals: SignalWithOutcome[]): SignalWithOutcome[][] {
  return clusterByGap(signals, {
    keyOf: (s) => {
      const d = signalDirection(s);
      if (!d || s.entry_price == null) return null;
      return `${s.ticker}|${d}`;
    },
    timeOf: (s) => Date.parse(s.emitted_at),
    joins: (first, next) => {
      const a = first.entry_price;
      const b = next.entry_price;
      if (a == null || b == null || a === 0) return false;
      return Math.abs((b - a) / a) * 100 <= CLUSTER_ENTRY_TOLERANCE_PCT;
    },
  });
}

// ── Clasificación de seguimiento ─────────────────────────────────────────────
// Resuelta = el cron evaluó el trade a una barrera (win/loss/timeout) o la orden
// no entró (no_fill). En seguimiento = 1D con niveles, aún sin resolver. No
// seguida = intradía, sin niveles, o no evaluable (geometría degenerada).
export type TrackStatus = 'resolved' | 'tracking' | 'unfollowed';
export const RESOLVED_OUTCOMES = new Set(['win', 'loss', 'timeout', 'no_fill']);

export function trackStatus(s: SignalWithOutcome): TrackStatus {
  const o = s.outcome?.outcome;
  if (o && RESOLVED_OUTCOMES.has(o)) return 'resolved';
  const trackable =
    s.timeframe === '1D' && s.entry_price != null && s.stop_loss != null && s.target_price != null;
  if (!s.outcome && trackable) return 'tracking';
  return 'unfollowed'; // not_evaluable, 1H intradía, o sin niveles
}

/** Track record colapsado por cluster (una observación por setup, no por reemisión). */
export interface ClusterTrackRecord {
  /** Clusters con al menos una fila resuelta (win/loss/timeout). */
  n: number;
  /** Outcome de la fila MÁS ANTIGUA de cada cluster (fila representativa). */
  win: number;
  loss: number;
  timeout: number;
  hitRate: number | null;
  /** Σ R de las filas representativas (una por cluster). null si ninguna trae R. */
  sumR: number | null;
  /** Filas resueltas que no pudieron clusterizarse (sin dirección/entrada). */
  unclustered: number;
  gapDays: number;
  entryTolerancePct: number;
}

export interface TrackRecord {
  win: number;
  loss: number;
  timeout: number;
  noFill: number;
  denom: number; // win+loss+timeout (base del hit-rate; no_fill no entra)
  hitRate: number | null;
  avgR: number | null;
  /** Σ R por fila (win/loss/timeout con R). Inflado por reemisión diaria — ver `clusters`. */
  sumR: number | null;
  clusters: ClusterTrackRecord;
}

function isCounted(s: SignalWithOutcome): boolean {
  const o = s.outcome?.outcome;
  return o === 'win' || o === 'loss' || o === 'timeout';
}

export function computeTrackRecord(signals: SignalWithOutcome[]): TrackRecord {
  let win = 0;
  let loss = 0;
  let timeout = 0;
  let noFill = 0;
  const rs: number[] = [];
  for (const s of signals) {
    const o = s.outcome?.outcome;
    if (o === 'win') win++;
    else if (o === 'loss') loss++;
    else if (o === 'timeout') timeout++;
    else if (o === 'no_fill') noFill++;
    if ((o === 'win' || o === 'loss' || o === 'timeout') && s.outcome?.r_multiple != null) {
      rs.push(s.outcome.r_multiple);
    }
  }
  const denom = win + loss + timeout;

  // Clusters SOLO sobre las filas que entran en el denominador por fila
  // (win/loss/timeout): así "por fila" y "por cluster" miden la misma población.
  // no_fill queda fuera igual que por fila.
  const counted = signals.filter(isCounted);
  const clusters = clusterSignals(counted);
  const clusteredIds = new Set<string>();
  const c = { win: 0, loss: 0, timeout: 0 };
  const clusterRs: number[] = [];
  for (const cl of clusters) {
    for (const s of cl) clusteredIds.add(s.id);
    const rep = cl[0];
    if (!rep) continue;
    const o = rep.outcome?.outcome;
    if (o === 'win') c.win++;
    else if (o === 'loss') c.loss++;
    else if (o === 'timeout') c.timeout++;
    if (rep.outcome?.r_multiple != null) clusterRs.push(rep.outcome.r_multiple);
  }
  const cDenom = c.win + c.loss + c.timeout;

  return {
    win,
    loss,
    timeout,
    noFill,
    denom,
    hitRate: denom > 0 ? Math.round((win / denom) * 100) : null,
    avgR: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    sumR: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) : null,
    clusters: {
      n: clusters.length,
      win: c.win,
      loss: c.loss,
      timeout: c.timeout,
      hitRate: cDenom > 0 ? Math.round((c.win / cDenom) * 100) : null,
      sumR: clusterRs.length > 0 ? clusterRs.reduce((a, b) => a + b, 0) : null,
      unclustered: counted.filter((s) => !clusteredIds.has(s.id)).length,
      gapDays: CLUSTER_GAP_DAYS,
      entryTolerancePct: CLUSTER_ENTRY_TOLERANCE_PCT,
    },
  };
}

/**
 * copyReport — copia un resumen de la señal al portapapeles. Recibe el
 * ticker/label/ccy ya resueltos por el llamante (era un closure en SignalCard).
 */
export function copyReport(
  signal: SignalWithOutcome,
  meta: { label: string },
  ccy: string
): void {
  const fmtPx = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : `${v} ${ccy}`;
  const lines = [
    `${signal.ticker} · ${meta.label} · ${signal.timeframe}`,
    `Confianza: ${signal.confidence_pct}%`,
    `Setup: ${signal.setup_detected}`,
    `Entrada: ${fmtPx(signal.entry_price)} · Stop: ${fmtPx(signal.stop_loss)} · Target: ${fmtPx(signal.target_price)}`,
    `R/B: ${signal.risk_reward_ratio?.toFixed(2) ?? '—'}`,
    `Invalida: ${signal.invalidation_factor}`,
  ];
  void navigator.clipboard.writeText(lines.join('\n'));
}
