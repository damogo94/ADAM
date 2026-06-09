import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSystemApi } from '@/lib/auth/system-access';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Uuid = z.string().uuid();

/**
 * GET /api/system/analyses/[id] → L2 detalle de un run concreto (consola /system).
 *
 * Gate (401/403) + UUID validado. Para el dato GLOBAL (la fila puede ser de
 * cualquier usuario) usamos el client SERVICE-ROLE (`admin`, bypassa RLS), no el
 * de sesión — la autorización ya la garantiza requireSystemApi().
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireSystemApi();
  if (!gate.ok) return gate.response;

  const parsed = Uuid.safeParse(params.id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('analyses_log')
    .select(
      'id, user_id, ticker, confluence_pct, direction, confidence, a1_output, a2_output, a3_output, debate_output, a4_output, latency_ms, tokens_used, usage_breakdown, created_at'
    )
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
