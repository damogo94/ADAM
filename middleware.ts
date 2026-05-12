import { NextResponse, type NextRequest } from 'next/server';
import { limiters } from '@/lib/ratelimit';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

/**
 * Edge middleware A.D.A.M. — dos responsabilidades:
 *
 * 1. Refresca la sesión de Supabase en cada request (auth.getUser() valida el JWT).
 *    Protege las rutas de app (/analysis, /watchlist, /signals, /system) redirigiendo
 *    a /login si el usuario no está autenticado.
 *
 * 2. Aplica rate-limiting por IP en /api/agents/* y /api/market/* — protege
 *    ANTHROPIC_API_KEY y la quota free-tier de Alpha Vantage.
 */
export const config = {
  // Excluye assets estáticos, _next interno y favicon — pero pasa por TODO lo demás
  // para que la sesión se refresque también en rutas públicas.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

const APP_ROUTES = ['/analysis', '/watchlist', '/signals', '/system'];
const AUTH_ROUTES = ['/login', '/signup'];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ── Rate limiting (solo en /api/agents/* y /api/market/*) ────────────────
  if (path.startsWith('/api/agents/') || path.startsWith('/api/market/')) {
    const ip = (req.headers.get('x-forwarded-for') ?? 'anon').split(',')[0]!.trim();
    const limiter = path.startsWith('/api/agents/') ? limiters.analysis : limiters.quote;
    const key = `${path.startsWith('/api/agents/') ? 'analysis' : 'quote'}:${ip}`;
    try {
      const { success, remaining, limit, reset } = await limiter.limit(key);
      if (!success) {
        return new NextResponse(
          JSON.stringify({
            error: 'rate_limit_exceeded',
            detail: `Has superado ${limit} req/min. Intenta de nuevo en unos segundos.`,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Reset': String(reset),
            },
          }
        );
      }
    } catch {
      // Upstash no configurado o caído → fail open, no romper el request
    }
  }

  // ── Refresh de sesión Supabase + protección de rutas ─────────────────────
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
    // Ya autenticado y entra al login → llévalo a /analysis
    const url = req.nextUrl.clone();
    url.pathname = '/analysis';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return response;
}
