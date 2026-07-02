import type { SignalHistory, SignalTradeOutcome } from '@/types/db';

/** Señal + outcome de trade (null = en seguimiento / no seguida). */
export type SignalWithOutcome = SignalHistory & { outcome: SignalTradeOutcome | null };

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

export interface TrackRecord {
  win: number;
  loss: number;
  timeout: number;
  noFill: number;
  denom: number; // win+loss+timeout (base del hit-rate; no_fill no entra)
  hitRate: number | null;
  avgR: number | null;
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
  return {
    win,
    loss,
    timeout,
    noFill,
    denom,
    hitRate: denom > 0 ? Math.round((win / denom) * 100) : null,
    avgR: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
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
