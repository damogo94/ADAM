import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Uuid = z.string().uuid();

const DETAIL_COLUMNS =
  'id, ticker, confluence_pct, net_pct, kappa, actionable_pct, direction, confidence, latency_ms, created_at, a1_output, a2_output, a3_output, debate_output, a4_output, estructura_output';

/**
 * GET /api/analyses/[id] → un run PROPIO, completo (outputs JSONB) para el render
 * read-only del historial.
 *
 * RLS (`analyses_select_own`) garantiza que solo devuelve filas del usuario
 * autenticado: un id ajeno (o inexistente) cae a `not_found`. Client de SESIÓN —
 * a diferencia de /api/system/analyses/[id], que usa admin porque sirve el dato
 * GLOBAL de cualquier usuario tras el gate de /system.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = Uuid.safeParse(params.id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('analyses_log')
    .select(DETAIL_COLUMNS)
    .eq('id', parsed.data)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'query_failed', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ analysis: data });
}
