/**
 * /api/metrics/calibration — Agregaciones de hit-rate sobre signal_outcomes.
 *
 * Usado por /system. Calcula hit-rate global y por bucket (direccion,
 * confianza, confluence) en una sola lectura. Joins en memoria porque el
 * volumen esperado es bajo (decenas-cientos de outcomes en v1).
 */

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

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

export async function GET() {
  // Solo usuarios autenticados pueden ver metricas internas
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  // Trae outcomes con el row del analisis correspondiente embedded
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (admin
    .from('signal_outcomes')
    .select(
      'analysis_id, horizon_days, hit, return_pct, analyses_log!inner(direction, confidence, confluence_pct)'
    )
    .limit(5000) as any);

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
  }

  finalize(total);
  for (const k of Object.keys(by_horizon)) finalize(by_horizon[k]!);
  for (const k of Object.keys(by_direction)) finalize(by_direction[k]!);
  for (const k of Object.keys(by_confidence)) finalize(by_confidence[k]!);
  for (const k of Object.keys(by_confluence)) finalize(by_confluence[k]!);

  return NextResponse.json({
    total,
    by_horizon,
    by_direction,
    by_confidence,
    by_confluence,
  });
}
