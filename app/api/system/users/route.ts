import { NextResponse } from 'next/server';
import { requireSystemApi } from '@/lib/auth/system-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/system/users → L0 listado global de usuarios (consola /system).
 *
 * Doble blindaje: requireSystemApi() (401/403) + el propio RPC
 * get_users_overview (SECURITY DEFINER) revalida is_system_authorized() en su
 * 1ª línea. Se llama con el CLIENT DE SESIÓN para que el RPC vea auth.jwt();
 * el dato global sale de la función DEFINER, no de una query con RLS.
 */
export async function GET() {
  const gate = await requireSystemApi();
  if (!gate.ok) return gate.response;

  const { data, error } = await gate.supabase.rpc('get_users_overview');
  if (error) {
    return NextResponse.json({ error: 'rpc_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ users: data ?? [] });
}
