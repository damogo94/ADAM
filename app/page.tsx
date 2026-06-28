/**
 * Pantalla raíz — funnel por sesión: visitante SIN sesión → landing /inicio;
 * usuario CON sesión → app /analysis. (Antes redirigía SIEMPRE a /analysis, lo
 * que dejaba /inicio inalcanzable para tráfico directo — auditoría Fase 1 · M3.)
 */
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? '/analysis' : '/inicio');
}
