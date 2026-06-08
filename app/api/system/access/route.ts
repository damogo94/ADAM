import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isSystemAuthorized } from '@/lib/auth/system-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/system/access → { authorized: boolean }
 *
 * SOLO para UX: que el bottom-nav decida si pinta el enlace "SISTEMA". Revela
 * únicamente si EL PROPIO usuario está en la allowlist (un booleano sobre sí
 * mismo, nada sensible). NO es una barrera de seguridad — esa vive en
 * app/system/layout.tsx y en las APIs internas. Siempre 200 para que el nav
 * lea el booleano sin tratar errores. Default-deny.
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ authorized: false });
  const authorized = await isSystemAuthorized(supabase);
  return NextResponse.json({ authorized });
}
