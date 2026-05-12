import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

/**
 * ⚠️ Cliente Supabase con SERVICE_ROLE_KEY — BYPASEA RLS.
 *
 * Uso EXCLUSIVO para:
 *  - El scanner CMT (cron job) que inserta filas en signals_history sin sesión de usuario
 *  - El orquestador A4 que escribe en analyses_log con un user_id explícito
 *
 * NUNCA exponer en cliente. NUNCA inferir user_id de algo que no sea
 * la sesión validada del usuario antes de llamar a este cliente.
 *
 * Si te encuentras llamando a este cliente desde un Server Component que ya
 * tiene la sesión del usuario, probablemente quieres `createSupabaseServer()`
 * en lugar — para que RLS te proteja de bugs.
 */
let admin: ReturnType<typeof createClient<Database>> | undefined;

export function createSupabaseAdmin() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        '[supabase/admin] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. ' +
          'This client must NEVER be used client-side.'
      );
    }
    admin = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
