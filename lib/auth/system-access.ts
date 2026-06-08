import 'server-only';
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * Autorización de acceso a /system (allowlist).
 *
 * La ventana /system expone diseño interno (prompts, costes, trazas). Estar
 * logueado NO basta: el usuario debe estar en `system_access`. La decisión se
 * lee SIEMPRE en servidor vía el RPC `is_system_authorized()` (SECURITY DEFINER):
 * matchea el email del JWT del propio usuario contra la allowlist.
 *
 * Dos invariantes de seguridad:
 *   1. DEFAULT-DENY: cualquier fallo (RPC error, red, timeout, data rara) → false.
 *      Nunca fail-open.
 *   2. SIN CACHE: se consulta fresco en cada request → revocar a alguien de la
 *      allowlist le quita el acceso de inmediato (sin esperar un TTL).
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServer>>;

/**
 * ¿El usuario de `supabase` (su JWT) está en la allowlist? Default-deny.
 * Recibe un client ya autenticado (createSupabaseServer) para no duplicar
 * el getUser cuando el caller ya lo tiene.
 */
export async function isSystemAuthorized(supabase: ServerClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_system_authorized');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export type SystemApiGate =
  | { ok: true; supabase: ServerClient; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Guard en SERVIDOR para las APIs internas de /system (la barrera REAL: aplica
 * aunque se llamen directamente sin pasar por la página).
 *
 *   - sin sesión           → 401
 *   - sesión sin allowlist → 403
 *   - autorizado           → { ok, supabase, userId }
 */
export async function requireSystemApi(): Promise<SystemApiGate> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  const authorized = await isSystemAuthorized(supabase);
  if (!authorized) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, supabase, userId: user.id };
}
