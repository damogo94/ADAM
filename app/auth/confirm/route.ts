import { type EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /auth/confirm — cierra el flujo de confirmación de email de Supabase.
 *
 * Ruta PÚBLICA por construcción: el middleware solo protege APP_ROUTES, así que
 * no la intercepta. Es el destino de los enlaces de los emails de auth
 * (confirmación de registro, magic link, recovery, cambio de email).
 *
 * Dos modos, en orden de robustez:
 *   1. `token_hash` + `type` → verifyOtp(). NO necesita el code_verifier del
 *      navegador de origen ⇒ funciona aunque el enlace se abra en otro
 *      dispositivo/cliente de correo. Requiere la plantilla de email que apunta
 *      a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
 *      (type=email es el valor vigente; "signup" es un alias deprecado).
 *   2. `code` → exchangeCodeForSession() (flujo PKCE por defecto de @supabase/ssr).
 *      Funciona en el MISMO navegador que inició el registro (el verifier vive en
 *      su storage). Es lo que llega con la plantilla por defecto.
 *
 * En ambos casos verifyOtp/exchange setean las cookies de sesión (vía el client
 * de servidor) antes de redirigir, de modo que el usuario llega autenticado.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  const supabase = await createSupabaseServer();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next); // throws NEXT_REDIRECT; cookies ya seteadas
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  // Sin parámetros válidos, o token/código caducado o ya consumido.
  redirect('/login?error=enlace_caducado');
}

/**
 * Valida el `next` contra open-redirect: solo paths internos `/foo`
 * (no `//foo`, ni `/\foo`, ni `http://…`). Fallback a `/analysis`.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/analysis';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/analysis';
  return raw;
}
