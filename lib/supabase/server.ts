import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/db';

/**
 * Cliente Supabase para Server Components, Server Actions y Route Handlers.
 * Lee la sesión de las cookies del request — RLS aplica con auth.uid() del JWT.
 *
 * Uso:
 *   const supabase = await createSupabaseServer();
 *   const { data } = await supabase.from('watchlists').select('*');
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // setAll falla en Server Components puros (no se pueden mutar cookies).
            // En ese caso es seguro ignorar — el middleware ya refresca la sesión.
          }
        },
      },
    }
  );
}
