import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSystemApi } from '@/lib/auth/system-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Uuid = z.string().uuid();

/**
 * GET /api/system/users/[id] → L1 actividad de un usuario (consola /system).
 *
 * Gate (401/403) + UUID validado antes de tocar DB + RPC get_user_activity
 * (SECURITY DEFINER, revalida la allowlist). Client de sesión (transporta el JWT
 * al check del RPC), nunca service-role.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireSystemApi();
  if (!gate.ok) return gate.response;

  const parsed = Uuid.safeParse(params.id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const { data, error } = await gate.supabase.rpc('get_user_activity', { target_user: parsed.data });
  if (error) {
    return NextResponse.json({ error: 'rpc_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ activity: data });
}
