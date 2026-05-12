import { NextResponse, type NextRequest } from 'next/server';
import { limiters } from '@/lib/ratelimit';

/**
 * Edge middleware: rate limit por IP en endpoints sensibles.
 * Las rutas que no matchean en `config.matcher` no pasan por aquí.
 */
export const config = {
  matcher: ['/api/agents/:path*', '/api/market/:path*'],
};

export async function middleware(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? req.ip ?? 'anon').split(',')[0]!.trim();
  const path = req.nextUrl.pathname;

  // Pick limiter by path. /api/agents/* → analysis (caro). /api/market/* → quote (barato).
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
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Limit', String(limit));
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    return res;
  } catch {
    // Fail open — si Upstash falla, no romper la request del usuario
    return NextResponse.next();
  }
}
