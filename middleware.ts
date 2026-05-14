import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

/**
 * Edge middleware A.D.A.M.
 *
 * Responsabilidad ÚNICA: refresh de sesión Supabase + redirect protection.
 *
 * El rate-limit por IP (que antes vivía aquí) se movió a los route handlers
 * Node-runtime — `@upstash/redis` no es compatible con Edge Runtime (usa
 * `process.version`). Mantener el middleware light, solo session + redirect.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

const APP_ROUTES = ['/analysis', '/watchlist', '/signals', '/system'];
const AUTH_ROUTES = ['/login', '/signup'];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const { response, user } = await updateSupabaseSession(req);

  const isAppRoute = APP_ROUTES.some((r) => path === r || path.startsWith(r + '/'));
  const isAuthRoute = AUTH_ROUTES.some((r) => path === r);

  if (isAppRoute && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user) {
    const url = req.nextUrl.clone();
    url.pathname = '/analysis';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return response;
}
