/**
 * /api/metrics/calibration — Agregaciones de hit-rate sobre signal_outcomes.
 *
 * Usado por /system. Calcula hit-rate global y por bucket (direccion,
 * confianza, confluence) en una sola lectura. Joins en memoria porque el
 * volumen esperado es bajo (decenas-cientos de outcomes en v1).
 *
 * R9 (plan de precisión 2026-09): una tasa por fila sin comparador ni n honesto
 * no dice nada. El JSON añade:
 *   - `base_rates`: sobre las MISMAS filas evaluadas, el acierto que habría
 *     tenido "siempre alcista" / "siempre neutral" / "siempre bajista" a 7d y
 *     30d, global y por ticker, junto al acierto real de ADAM (`adam`). Mismo
 *     criterio de hit que el cron (`scoreSignal` + umbral `max(2%, k·ATR%)`;
 *     sin ATR en la fila → piso 2%, exactamente el fallback del cron).
 *   - `n_clusters`: n efectivo colapsando análisis del mismo ticker cuyo
 *     `created_at` dista ≤ CLUSTER_GAP_DAYS del anterior (regla de cadena) en
 *     un solo cluster; un cluster acierta si acierta su fila más antigua.
 * Ninguno de los dos cambia cómo se puntúa: son lecturas adicionales.
 */

import { NextResponse } from 'next/server';
import { requireSystemApi } from '@/lib/auth/system-access';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  directionOfA1,
  directionOfA2,
  directionOfA3,
  directionOfEstructura,
} from '@/agents/a4/compute';
import {
  scoreSignal,
  dbToScoringDirection,
  extractAtrPct,
  volatilityThresholdPct,
  SIGNAL_THRESHOLD_PCT,
  SIGNAL_ATR_K,
  type Direction,
} from '@/lib/scoring';
import { clusterByGap, CLUSTER_GAP_DAYS } from '@/components/signals/helpers';
import { A1Output, A2Output, A3Output } from '@/agents/shared/types';
import { EstructuraOutput } from '@/agents/estructura/schema';

export const runtime = 'nodejs';

type Bucket = { n: number; hits: number; hit_rate_pct: number | null };
type ByKey = Record<string, Bucket>;

function emptyBucket(): Bucket {
  return { n: 0, hits: 0, hit_rate_pct: null };
}

function finalize(b: Bucket): Bucket {
  b.hit_rate_pct = b.n === 0 ? null : Math.round((b.hits / b.n) * 1000) / 10;
  return b;
}

function tally(b: Bucket, hit: boolean): void {
  b.n++;
  if (hit) b.hits++;
}

const HORIZON_KEYS = ['7', '30'] as const;
type HorizonKey = (typeof HORIZON_KEYS)[number];

/** Tasa base de una celda: las tres constantes + el acierto real de ADAM en las mismas filas. */
type BaseRateCell = { adam: Bucket; alcista: Bucket; neutral: Bucket; bajista: Bucket };
type BaseRateByHorizon = Record<HorizonKey, BaseRateCell>;

function emptyBaseRateCell(): BaseRateCell {
  return { adam: emptyBucket(), alcista: emptyBucket(), neutral: emptyBucket(), bajista: emptyBucket() };
}
function emptyBaseRateByHorizon(): BaseRateByHorizon {
  return { '7': emptyBaseRateCell(), '30': emptyBaseRateCell() };
}
function finalizeBaseRateByHorizon(b: BaseRateByHorizon): BaseRateByHorizon {
  for (const h of HORIZON_KEYS) {
    const cell = b[h];
    finalize(cell.adam);
    finalize(cell.alcista);
    finalize(cell.neutral);
    finalize(cell.bajista);
  }
  return b;
}

const CONSTANT_DIRECTIONS: Direction[] = ['alcista', 'neutral', 'bajista'];

function confluenceBucket(pct: number): '0-30' | '31-60' | '61-100' {
  if (pct <= 30) return '0-30';
  if (pct <= 60) return '31-60';
  return '61-100';
}

/** κ ∈ [0,1] → bucket cualitativo (mismos cortes que los niveles: 0.34 / 0.67). */
function kappaBucket(k: number): 'baja' | 'media' | 'alta' {
  if (k >= 0.67) return 'alta';
  if (k >= 0.34) return 'media';
  return 'baja';
}

export async function GET() {
  // Barrera real en servidor: auth + allowlist (default-deny). Estas métricas
  // son cross-user (service-role bypassa RLS) → SOLO usuarios de la allowlist.
  // Aplica aunque se llame directamente sin pasar por la página /system.
  const gate = await requireSystemApi();
  if (!gate.ok) return gate.response;

  const admin = createSupabaseAdmin();

  // Trae outcomes con el row del analisis correspondiente embedded
  const { data: rows, error } = await admin
    .from('signal_outcomes')
    .select(
      'analysis_id, horizon_days, hit, return_pct, analyses_log!inner(ticker, created_at, direction, confidence, confluence_pct, actionable_pct, kappa, initial_price, a1_output, a2_output, a3_output, estructura_output)'
    )
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }

  type Row = {
    analysis_id: string;
    horizon_days: number;
    hit: boolean;
    return_pct: number;
    analyses_log: {
      ticker: string;
      created_at: string;
      direction: string;
      confidence: string;
      confluence_pct: number;
      actionable_pct: number | null;
      kappa: number | null;
      initial_price: number | null;
      a1_output: unknown;
      a2_output: unknown;
      a3_output: unknown;
      estructura_output: unknown;
    };
  };
  const data = (rows ?? []) as Row[];

  // ── R9 · tasa base (mismas filas, mismo criterio de hit que el cron) ──────
  const baseGlobal = emptyBaseRateByHorizon();
  const baseByTicker: Record<string, BaseRateByHorizon> = {};
  // Filas sin initial_price: no se puede reconstruir eval_price ni el umbral ATR
  // (el cron nunca las evalúa — las filtra con initial_price IS NOT NULL — así
  // que en la práctica es 0; se reporta por honestidad).
  let baseExcluded = 0;

  const by_horizon: ByKey = { '7': emptyBucket(), '30': emptyBucket() };
  const by_direction: ByKey = {
    alcista: emptyBucket(),
    bajista: emptyBucket(),
    neutral: emptyBucket(),
  };
  // Solo los valores reales del enum DB confidence_t (baja/media/alta) —
  // 'muy_alta' no existe en ningún output y era un bucket muerto perpetuo.
  const by_confidence: ByKey = {
    baja: emptyBucket(),
    media: emptyBucket(),
    alta: emptyBucket(),
  };
  const by_confluence: ByKey = {
    '0-30': emptyBucket(),
    '31-60': emptyBucket(),
    '61-100': emptyBucket(),
  };
  // Ejes nuevos (Fase 1). Solo cuentan filas con los campos (análisis post-deploy);
  // las viejas traen null → quedan fuera del bucket (no inventamos calibración).
  const by_actionable: ByKey = {
    '0-30': emptyBucket(),
    '31-60': emptyBucket(),
    '61-100': emptyBucket(),
  };
  const by_kappa: ByKey = { baja: emptyBucket(), media: emptyBucket(), alta: emptyBucket() };
  // Opción C · track-record per-agente. Mide el acierto DIRECCIONAL de cada
  // agente por separado (su dirección implícita vs el movimiento real). Es la
  // capa de MEDICIÓN — base para una futura reponderación por fiabilidad; aún
  // NO cambia la confluencia. Solo filas con outcome (post-deploy de cada campo).
  const by_agent: ByKey = {
    a1: emptyBucket(),
    a2: emptyBucket(),
    a3: emptyBucket(),
    estructura: emptyBucket(),
  };
  const total = emptyBucket();

  for (const r of data) {
    const a = r.analyses_log;
    if (!a) continue;
    total.n++;
    if (r.hit) total.hits++;

    const h = String(r.horizon_days);
    const bh = by_horizon[h];
    if (bh) {
      bh.n++;
      if (r.hit) bh.hits++;
    }

    // Tasa base: ¿qué habría acertado una constante en ESTA fila? Reconstruye
    // eval_price desde return_pct y usa el MISMO umbral que el cron (ATR desde
    // a3_output con el extractor tolerante; sin ATR → piso SIGNAL_THRESHOLD_PCT).
    if (h === '7' || h === '30') {
      const initial = a.initial_price;
      if (initial != null && initial > 0) {
        const evalPrice = initial * (1 + r.return_pct / 100);
        const threshold = volatilityThresholdPct(extractAtrPct(a.a3_output, initial));
        const cellG = baseGlobal[h];
        const perTicker = (baseByTicker[a.ticker] ??= emptyBaseRateByHorizon());
        const cellT = perTicker[h];
        tally(cellG.adam, r.hit);
        tally(cellT.adam, r.hit);
        for (const d of CONSTANT_DIRECTIONS) {
          const hit = scoreSignal({
            direccion: d,
            initial_price: initial,
            eval_price: evalPrice,
            threshold_pct: threshold,
          }).hit;
          tally(cellG[d], hit);
          tally(cellT[d], hit);
        }
      } else {
        baseExcluded++;
      }
    }
    const bd = by_direction[dbToScoringDirection(a.direction)];
    if (bd) {
      bd.n++;
      if (r.hit) bd.hits++;
    }
    const bc = by_confidence[a.confidence];
    if (bc) {
      bc.n++;
      if (r.hit) bc.hits++;
    }
    const cb = confluenceBucket(a.confluence_pct);
    const bcfl = by_confluence[cb];
    if (bcfl) {
      bcfl.n++;
      if (r.hit) bcfl.hits++;
    }
    // Ejes nuevos — null-guard: filas pre-Fase-1 no entran.
    if (a.actionable_pct != null) {
      const ba = by_actionable[confluenceBucket(a.actionable_pct)];
      if (ba) {
        ba.n++;
        if (r.hit) ba.hits++;
      }
    }
    if (a.kappa != null) {
      const bk = by_kappa[kappaBucket(a.kappa)];
      if (bk) {
        bk.n++;
        if (r.hit) bk.hits++;
      }
    }

    // Atribución per-agente: la dirección IMPLÍCITA de cada agente se puntúa
    // contra el movimiento real con el MISMO umbral (ATR) que usó la evaluación.
    // Solo cuentan filas donde el agente tomó postura direccional (alcista/
    // bajista) — neutral/ausente = "sin opinión", ni premia ni penaliza.
    const initial = a.initial_price;
    if (initial != null && initial > 0) {
      const evalPrice = initial * (1 + r.return_pct / 100);
      const a3p = A3Output.safeParse(a.a3_output);
      // Umbral con el MISMO extractor tolerante que usó el cron al puntuar (no el
      // safeParse estricto): una fila legacy que no pasa el parse ya NO cae al 2%
      // fijo aquí mientras el cron la midió con umbral ATR (evita incomparabilidad).
      const threshold = volatilityThresholdPct(extractAtrPct(a.a3_output, initial));
      const a1p = A1Output.safeParse(a.a1_output);
      const a2p = A2Output.safeParse(a.a2_output);
      const estp = EstructuraOutput.safeParse(a.estructura_output);
      const agentDirs: Record<string, 'alcista' | 'bajista' | 'neutral' | null> = {
        a1: a1p.success ? directionOfA1(a1p.data) : null,
        a2: a2p.success ? directionOfA2(a2p.data) : null,
        a3: a3p.success ? directionOfA3(a3p.data) : null,
        estructura: estp.success ? directionOfEstructura(estp.data) : null,
      };
      for (const ag of Object.keys(by_agent)) {
        const d = agentDirs[ag];
        if (d !== 'alcista' && d !== 'bajista') continue; // sin postura → no cuenta
        const ba = by_agent[ag]!;
        ba.n++;
        if (
          scoreSignal({
            direccion: d,
            initial_price: initial,
            eval_price: evalPrice,
            threshold_pct: threshold,
          }).hit
        ) {
          ba.hits++;
        }
      }
    }
  }

  finalize(total);
  for (const k of Object.keys(by_horizon)) finalize(by_horizon[k]!);
  for (const k of Object.keys(by_direction)) finalize(by_direction[k]!);
  for (const k of Object.keys(by_confidence)) finalize(by_confidence[k]!);
  for (const k of Object.keys(by_confluence)) finalize(by_confluence[k]!);
  for (const k of Object.keys(by_actionable)) finalize(by_actionable[k]!);
  for (const k of Object.keys(by_kappa)) finalize(by_kappa[k]!);
  for (const k of Object.keys(by_agent)) finalize(by_agent[k]!);

  finalizeBaseRateByHorizon(baseGlobal);
  for (const t of Object.keys(baseByTicker)) finalizeBaseRateByHorizon(baseByTicker[t]!);

  // ── R9 · n efectivo por cluster ──────────────────────────────────────────
  // Por horizonte (cada análisis tiene hasta una fila por horizonte): agrupa por
  // ticker, encadena por created_at con gap ≤ CLUSTER_GAP_DAYS respecto a la fila
  // anterior del cluster, y el cluster acierta si acierta su fila MÁS ANTIGUA.
  // `n` = clusters (el n honesto); `rows` = filas por fila que colapsaron.
  const n_clusters: {
    gap_days: number;
    by_horizon: Record<HorizonKey, Bucket & { rows: number }>;
  } = {
    gap_days: CLUSTER_GAP_DAYS,
    by_horizon: {
      '7': { ...emptyBucket(), rows: 0 },
      '30': { ...emptyBucket(), rows: 0 },
    },
  };
  for (const h of HORIZON_KEYS) {
    const rowsH = data.filter((r) => r.analyses_log && String(r.horizon_days) === h);
    const clusters = clusterByGap(rowsH, {
      keyOf: (r) => r.analyses_log.ticker,
      timeOf: (r) => Date.parse(r.analyses_log.created_at),
    });
    const b = n_clusters.by_horizon[h];
    b.rows = rowsH.length;
    for (const cl of clusters) {
      const oldest = cl[0];
      if (!oldest) continue;
      tally(b, oldest.hit);
    }
    finalize(b);
  }

  return NextResponse.json({
    total,
    by_horizon,
    by_direction,
    by_confidence,
    by_confluence,
    by_actionable,
    by_kappa,
    by_agent,
    base_rates: {
      // Umbral documentado para que el lector sepa con qué criterio se puntuó.
      threshold: { floor_pct: SIGNAL_THRESHOLD_PCT, atr_k: SIGNAL_ATR_K, no_atr_fallback_pct: SIGNAL_THRESHOLD_PCT },
      global: baseGlobal,
      by_ticker: baseByTicker,
      excluded_no_initial_price: baseExcluded,
    },
    n_clusters,
  });
}
