/**
 * Digest "3 cosas que mirar hoy" para la cabecera del Watchlist Radar.
 *
 * Decisión E de FASE 0: combinación con prioridad a CMT.
 *
 *   1) PRIORIDAD: signals unacked en `signals_history`, ordenadas por
 *      severidad del `level` (urgente > atencion > monitorear).
 *   2) Si quedan slots, se completa con DELTAS relevantes:
 *      - direction_flipped o a3_signal_flipped  → severity high
 *      - anomaly_new                             → severity high
 *      - |confluence_delta_pct| ≥ 20             → severity medium
 *      - |confluence_delta_pct| ≥ 10             → severity low
 *
 * Función PURA. Recibe las filas ya construidas y devuelve top-3.
 *
 * Reglas:
 *   - Dedupe por ticker: si un ticker entra por signal, NO vuelve a
 *     entrar por delta. La signal manda.
 *   - Máximo 3 entradas, en orden de relevancia.
 */

import type { DigestEntry_t, RadarRow_t } from './types';

const LEVEL_SEVERITY: Record<string, 'high' | 'medium' | 'low'> = {
  urgente: 'high',
  atencion: 'medium',
  monitorear: 'low',
  sin_senal: 'low',
};

const SEVERITY_ORDER: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function buildDigest(rows: RadarRow_t[]): DigestEntry_t[] {
  const entries: DigestEntry_t[] = [];
  const seenTickers = new Set<string>();

  // 1) Signals — prioridad absoluta
  const fromSignals = rows
    .filter((r) => r.signal !== null)
    .map((r): DigestEntry_t => {
      const sig = r.signal!;
      return {
        ticker: r.ticker,
        source: 'signal',
        reason: `${sig.level.toUpperCase()} · ${sig.setup_detected}`,
        severity: LEVEL_SEVERITY[sig.level] ?? 'low',
      };
    })
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  for (const e of fromSignals) {
    if (entries.length >= 3) break;
    if (seenTickers.has(e.ticker)) continue;
    entries.push(e);
    seenTickers.add(e.ticker);
  }

  if (entries.length >= 3) return entries;

  // 2) Deltas — completar con cambios relevantes
  const fromDeltas: DigestEntry_t[] = [];
  for (const r of rows) {
    if (seenTickers.has(r.ticker)) continue;
    const d = r.delta;
    if (!d.has_previous && !d.anomaly_new) continue;

    if (d.direction_flipped || d.a3_signal_flipped) {
      fromDeltas.push({
        ticker: r.ticker,
        source: 'delta',
        reason: d.direction_flipped
          ? `dirección cambió a ${r.latest?.direction ?? 'neutral'}`
          : `A3 cambió a ${r.latest?.a3_signal ?? 'hold'}`,
        severity: 'high',
      });
      continue;
    }

    if (d.anomaly_new) {
      const type = r.latest?.a1_anomaly_type ?? 'anomalia';
      fromDeltas.push({
        ticker: r.ticker,
        source: 'delta',
        reason: `anomalía nueva (${type})`,
        severity: 'high',
      });
      continue;
    }

    const abs = d.confluence_delta_pct === null ? 0 : Math.abs(d.confluence_delta_pct);
    if (abs >= 20) {
      const sign = (d.confluence_delta_pct ?? 0) >= 0 ? '↑' : '↓';
      fromDeltas.push({
        ticker: r.ticker,
        source: 'delta',
        reason: `confluencia ${sign} ${abs.toFixed(0)}pts`,
        severity: 'medium',
      });
    } else if (abs >= 10) {
      const sign = (d.confluence_delta_pct ?? 0) >= 0 ? '↑' : '↓';
      fromDeltas.push({
        ticker: r.ticker,
        source: 'delta',
        reason: `confluencia ${sign} ${abs.toFixed(0)}pts`,
        severity: 'low',
      });
    }
  }

  fromDeltas.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  for (const e of fromDeltas) {
    if (entries.length >= 3) break;
    if (seenTickers.has(e.ticker)) continue;
    entries.push(e);
    seenTickers.add(e.ticker);
  }

  return entries;
}
