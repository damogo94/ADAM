import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/db';

/**
 * Refresca la sesión de Supabase desde el middleware (Edge runtime).
 *
 * Llamar al inicio de cada request — Supabase rota el access_token en cada
 * refresh, así que necesitamos persistir las cookies nuevas en la response.
 *
 * Devuelve { response, user, supabase }:
 *  - response: NextResponse con las cookies refrescadas (usar como base)
 *  - user: User | null (si null, redirigir a /login en rutas protegidas)
 *  - supabase: el client (con la sesión del request) para checks extra en el
 *    middleware, p.ej. la allowlist de /system vía RPC. NO crear otro client.
 */
export async function updateSupabaseSession(req: NextRequest) {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // ⚠️ getUser() valida el JWT contra el server (no confía en la cookie).
  // No usar getSession() en server — la cookie puede ser falsificada.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}
