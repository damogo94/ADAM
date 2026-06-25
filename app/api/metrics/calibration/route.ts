/**
 * /api/metrics/calibration — Agregaciones de hit-rate sobre signal_outcomes.
 *
 * Usado por /system. Calcula hit-rate global y por bucket (direccion,
 * confianza, confluence) en una sola lectura. Joins en memoria porque el
 * volumen esperado es bajo (decenas-cientos de outcomes en v1).
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
import { scoreSignal, SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K } from '@/lib/scoring';
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
      'analysis_id, horizon_days, hit, return_pct, analyses_log!inner(direction, confidence, confluence_pct, actionable_pct, kappa, initial_price, a1_output, a2_output, a3_output, estructura_output)'
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

  const by_horizon: ByKey = { '7': emptyBucket(), '30': emptyBucket() };
  const by_direction: ByKey = {
    alcista: emptyBucket(),
    bajista: emptyBucket(),
    neutral: emptyBucket(),
  };
  const by_confidence: ByKey = {
    baja: emptyBucket(),
    media: emptyBucket(),
    alta: emptyBucket(),
    muy_alta: emptyBucket(),
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
    const bd = by_direction[a.direction];
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
      const atr = a3p.success ? a3p.data.operativa.atr_actual : null;
      const threshold =
        atr != null
          ? Math.max(SIGNAL_THRESHOLD_PCT, SIGNAL_ATR_K * (atr / initial) * 100)
          : SIGNAL_THRESHOLD_PCT;
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

  return NextResponse.json({
    total,
    by_horizon,
    by_direction,
    by_confidence,
    by_confluence,
    by_actionable,
    by_kappa,
    by_agent,
  });
}
