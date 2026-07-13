import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServer>>;

/**
 * Prelude compartido de los endpoints de agentes: CSRF (same-origin) → rate-limit
 * por IP → auth (cookie). Es el bloque idéntico que abría run/a2/a3/a4/debate/
 * estructura. Devuelve un NextResponse (403 CSRF · 429/503 rate-limit · 401 sin
 * sesión) si algún gate rechaza, o `{ user, supabase }` si pasa:
 *
 *   const gate = await requireApiUser(req);
 *   if (gate instanceof NextResponse) return gate;
 *   const { user, supabase } = gate;
 *
 * NO valida el body: cada ruta CONSERVA su propio `RequestSchema.safeParse` — el
 * `.strict()` de A3/Estructura es su capa 3 de aislamiento y no debe centralizarse.
 * El bucket de rate-limit es 'analysis' por defecto (el que usan los 6 endpoints).
 */
export async function requireApiUser(
  req: NextRequest,
  bucket: 'analysis' | 'quote' = 'analysis'
): Promise<{ user: User; supabase: SupabaseServer } | NextResponse> {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  const ipLimit = await rateLimitByIP(req, bucket);
  if (ipLimit) return ipLimit;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  return { user, supabase };
}
