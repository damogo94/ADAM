/**
 * Gates de exposición F1/F2/F3 (ADR-0006) — POST-FILTROS de investigación.
 *
 * Funciones PURAS que operan sobre la salida de `computeTechnical()` (operativa +
 * medias.sma200 + último close). Viven en `scripts/lib` a propósito: NO se
 * cablean en `agents/a3/compute/operative.ts` ni en `build-signal.ts` (plan
 * 2026-09 §8 — un gate de emisión destruye el rastro y la evidencia es de 2
 * setups). Un "veto" solo excluye el plan del conjunto retenido del harness.
 *
 * `GATE_THRESHOLDS` es el bloque pre-registrado del ADR-0006: su sha256 debe
 * coincidir con `ADR_0006_THRESHOLDS_SHA256` (test en __tests__/gates.test.ts).
 * Cambiar un umbral aquí sin un ADR nuevo rompe ese test — por diseño.
 */
import { createHash } from 'node:crypto';

export type Horizonte = 'intradia' | 'swing' | 'posicional';

export const GATE_THRESHOLDS = {
  adr: '0006',
  version: 1,
  registered_at: '2026-09-11',
  F1: {
    veto_sell_if_price_above_sma200: true,
    mirror_veto_buy_if_price_below_sma200: true,
    sma200_null: 'indeterminado: no veta, se reporta aparte',
  },
  F2: {
    limit_max_dist_atr: 2,
    sensitivity_atr: [1.5, 2, 3],
    applies_to: 'entry_type=limit',
    atr_null: 'indeterminado: no veta, se reporta aparte',
  },
  F3: {
    rule: 'K = |target - entrada| / ATR > sqrt(WIN[horizonte])',
    window_days: { intradia: 30, swing: 30, posicional: 120 },
  },
  costs_bps_roundtrip: { central: { equity: 10, crypto: 40 }, stress: { equity: 20, crypto: 80 } },
  harness: {
    lookback: 300,
    step: 21,
    range: '10y',
    legacy_h2: 63,
    min_candles: 368,
    regime_source: 'SPY close vs SMA200 (bull/bear/lateral)',
  },
  universe: {
    winners: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'XOM', 'JPM', 'JNJ', 'WMT', 'CAT', 'TLT', 'GLD', 'USO', 'EEM', 'EFA', 'BTC-USD', 'ETH-USD'],
    crashed: ['META', 'NFLX', 'TSLA', 'AMD', 'INTC', 'BABA', 'DIS', 'BA', 'GE', 'F', 'BAC', 'C', 'T', 'PFE', 'OXY', 'ARKK', 'MMM', 'SOL-USD', 'ADA-USD', 'DOGE-USD', 'XRP-USD'],
    collapsed_rule: {
      drawdown_min: 0.8,
      peak_and_trough_between: ['2016-01-01', '2024-12-31'],
      still_listed_on_yahoo: true,
      min_candles: 368,
      verified_by_harness: true,
    },
    collapsed: ['PTON', 'ZM', 'TDOC', 'RIVN', 'LCID', 'COIN', 'HOOD', 'AMC', 'GME', 'PLUG', 'CVNA', 'OPEN', 'AFRM', 'SNAP', 'ROKU', 'BYND', 'UPST', 'NIO', 'PYPL', 'DOCU', 'TWLO', 'RUN', 'SEDG', 'CHPT', 'MRNA', 'LUMN', 'LUNC-USD', 'ICP-USD', 'FIL-USD', 'AXS-USD', 'SAND-USD', 'EOS-USD'],
  },
  primary: {
    gate: 'F1 OR F3',
    branch: 'sell (A3_LONG_TREND_FOLLOW=OFF, compute identico a prod)',
    universe: 'des-sesgado = winners + crashed + collapsed(verificados)',
    metric: 'media de R neto por plan RELLENADO @20/80 bps (no_fill y not_evaluable excluidos)',
    ci: { method: 'block bootstrap por cluster ticker x trimestre', B: 2000, seed: 20260911, level: 0.95 },
    pass: 'limite inferior del IC 95% > 0',
  },
  conservation: {
    regime_delta_min_r: -0.05,
    regime_delta_def: 'mean_net(gated, regimen) - mean_net(ungated, regimen) por bull/bear/lateral',
    must_beat: ['no_shorts (0R)', 'no_shorts_in_index_etf_commodity (mean net de los cortos restantes)'],
    report_vetoed_winners: true,
  },
  exploratory: {
    correction: 'Holm-Bonferroni',
    alpha: 0.05,
    p_value: 'one-sided bootstrap: (#{boot <= 0} + 1) / (B + 1)',
    tests: ['F1', 'F3', 'F1_mirror_buy', 'F2@1.5', 'F2@2', 'F2@3', 'F1 OR F2 OR F3', 'delta gated - ungated (F1 OR F3)'],
  },
  sanity_buy_legacy: {
    gross: 0.077,
    net_10_40: 0.031,
    tol: 0.01,
    window_end: '2026-07-12',
    grid_offsets_tried: [0, 1],
  },
};

/** Hash publicado en docs/adr/0006-gates-exposicion-cortos-pre-registro.md. */
export const ADR_0006_THRESHOLDS_SHA256 =
  'cf0876191230d3ce69180d8d05deb16c0a8049e0d264d620b16fb8fa0a8cc8d9';

/** JSON compacto canónico (orden de claves = orden de inserción) y su sha256. */
export const thresholdsCanonical = (): string => JSON.stringify(GATE_THRESHOLDS);
export const thresholdsHash = (): string =>
  createHash('sha256').update(thresholdsCanonical(), 'utf8').digest('hex');

// ───────────────────────────────────────────────────────────────────────────
// Predicados
// ───────────────────────────────────────────────────────────────────────────

export interface GateInput {
  signal: 'buy' | 'sell' | 'hold';
  /** Último close de la ventana de compute (precio en el momento del plan). */
  price: number;
  sma200: number | null;
  entry_type: 'market' | 'limit' | null;
  entrada: number | null;
  target: number | null;
  atr: number | null;
  horizonte: Horizonte;
}

const validAtr = (atr: number | null): atr is number =>
  atr != null && Number.isFinite(atr) && atr > 0;

/**
 * F1 · veto de régimen: sell con precio > SMA200 (espejo: buy con precio < SMA200).
 * null = indeterminado (sin SMA200 o sin plan) — NO veta, se reporta aparte.
 */
export function f1VetoRegimen(i: GateInput): boolean | null {
  if (i.signal === 'hold') return null;
  if (i.sma200 == null || !Number.isFinite(i.sma200)) return null;
  if (i.signal === 'sell') return i.price > i.sma200;
  return i.price < i.sma200;
}

/** Distancia entrada−precio en ATRs (null si no aplica). */
export function distEntradaAtr(i: GateInput): number | null {
  if (i.entrada == null || !validAtr(i.atr)) return null;
  return Math.abs(i.entrada - i.price) / i.atr;
}

/**
 * F2 · límite lejano = 'esperando': entry_type=limit y |entrada−precio|/ATR > max.
 * null = no aplica (market/hold) o indeterminado (ATR inválido).
 */
export function f2Esperando(i: GateInput, maxDistAtr: number): boolean | null {
  if (i.signal === 'hold' || i.entry_type !== 'limit') return null;
  const d = distEntradaAtr(i);
  if (d == null) return null;
  return d > maxDistAtr;
}

/** K = |target − entrada| / ATR (null si no aplica). */
export function kTargetAtr(i: GateInput): number | null {
  if (i.entrada == null || i.target == null || !validAtr(i.atr)) return null;
  return Math.abs(i.target - i.entrada) / i.atr;
}

/**
 * F3 · target incoherente con la ventana: K > sqrt(WIN[horizonte]). La constante
 * deriva del modelo K² barras de `horizonteFromTarget` + HORIZON_WINDOW_DAYS —
 * no se elige. null = indeterminado.
 */
export function f3KIncoherente(
  i: GateInput,
  windowDays: Record<Horizonte, number> = GATE_THRESHOLDS.F3.window_days
): boolean | null {
  if (i.signal === 'hold') return null;
  const k = kTargetAtr(i);
  if (k == null) return null;
  return k > Math.sqrt(windowDays[i.horizonte]);
}

export interface GateTags {
  f1: boolean | null;
  f2: Record<string, boolean | null>;
  f3: boolean | null;
  k: number | null;
  dist_atr: number | null;
  /** (precio − sma200) / sma200 · 100, null sin SMA200. */
  price_vs_sma200_pct: number | null;
}

export function applyGates(i: GateInput): GateTags {
  const f2: Record<string, boolean | null> = {};
  for (const s of GATE_THRESHOLDS.F2.sensitivity_atr) f2[String(s)] = f2Esperando(i, s);
  return {
    f1: f1VetoRegimen(i),
    f2,
    f3: f3KIncoherente(i),
    k: kTargetAtr(i),
    dist_atr: distEntradaAtr(i),
    price_vs_sma200_pct:
      i.sma200 != null && Number.isFinite(i.sma200) && i.sma200 !== 0
        ? ((i.price - i.sma200) / i.sma200) * 100
        : null,
  };
}

/** true solo si ALGÚN flag es exactamente true (null = indeterminado no veta). */
export const anyVeto = (...flags: (boolean | null | undefined)[]): boolean =>
  flags.some((f) => f === true);
