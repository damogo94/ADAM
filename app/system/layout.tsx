import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isSystemAuthorized } from '@/lib/auth/system-access';

/**
 * Gate de /system en SERVIDOR — la barrera REAL (el middleware es solo el
 * primer filtro/UX). Se ejecuta en cada navegación al segmento /system.
 *
 * Default-deny: sin sesión → login; con sesión pero sin allowlist → redirect
 * silencioso a /analysis (no revelamos que /system existe). `isSystemAuthorized`
 * ya es default-deny ante cualquier error del RPC.
 */

// Dinámica siempre: nunca optimizar estáticamente una página gated (la decisión
// de autorización se evalúa por request, sin cache).
export const dynamic = 'force-dynamic';

// No indexar la ventana de diseño interno.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/system');
  if (!(await isSystemAuthorized(supabase))) redirect('/analysis');

  return <>{children}</>;
}
