import { NextRequest, NextResponse } from 'next/server';
import { limiters } from '@/lib/ratelimit';

/**
 * Rate-limit por IP — invocar al inicio de los route handlers Node-runtime.
 *
 * Movido del middleware (Edge) porque @upstash/redis no es Edge-compatible
 * (usa process.version). Aquí en Node corre perfectamente.
 *
 * Devuelve NextResponse 429/503 si rechaza, null si pasa.
 *
 *   const rl = await rateLimitByIP(req, 'analysis');
 *   if (rl) return rl;
 */
export async function rateLimitByIP(
  req: NextRequest,
  bucket: 'analysis' | 'quote'
): Promise<NextResponse | null> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'anon').split(',')[0]!.trim();
  const key = `${bucket}:${ip}`;
  const limiter = bucket === 'analysis' ? limiters.analysis : limiters.quote;
  try {
    const { success, remaining, limit, reset } = await limiter.limit(key);
    if (!success) {
      return NextResponse.json(
        {
          error: 'rate_limit_exceeded',
          detail: `Has superado ${limit} req/min. Intenta de nuevo en unos segundos.`,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
          },
        }
      );
    }
    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ratelimit] error in route:', err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'rate_limit_unavailable',
          detail: 'Servicio temporalmente no disponible. Reintenta en unos segundos.',
        },
        { status: 503 }
      );
    }
    return null; // dev: fail-open
  }
}

/**
 * CSRF defense — verifica que el Origin/Referer del request coincide con el
 * host real del servidor. Bloquea fetch cross-origin con credentials incluso
 * cuando la cookie tiene SameSite=Lax permisivo.
 *
 * Aplicar a TODOS los POST/PUT/DELETE/PATCH endpoints cookie-authenticated.
 * Devuelve NextResponse 403 si rechaza, null si pasa.
 *
 * En dev (NODE_ENV !== 'production') sólo loguea — no bloquea — para no
 * romper tests locales con curl que no envia Origin.
 */
export function checkSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');

  if (!host) {
    // Sin host header no podemos verificar. Solo en prod fallamos.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'csrf_blocked', detail: 'host missing' }, { status: 403 });
    }
    return null;
  }

  // Construye la origen esperada. https en prod, http o https en dev.
  const proto = req.headers.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const expected = `${proto}://${host}`;

  // Si hay Origin, debe coincidir exactamente
  if (origin) {
    if (origin === expected) return null;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[csrf] Origin mismatch (dev pass-through): got ${origin}, expected ${expected}`);
      return null;
    }
    return NextResponse.json({ error: 'csrf_blocked', detail: 'origin mismatch' }, { status: 403 });
  }

  // No hay Origin (Safari a veces lo omite en same-origin) → caer en Referer
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (`${refUrl.protocol}//${refUrl.host}` === expected) return null;
    } catch {
      /* malformed referer */
    }
    if (process.env.NODE_ENV !== 'production') return null;
    return NextResponse.json({ error: 'csrf_blocked', detail: 'referer mismatch' }, { status: 403 });
  }

  // Ni Origin ni Referer. Probable curl o script. En prod fail-closed.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'csrf_blocked', detail: 'missing origin and referer' }, { status: 403 });
  }
  return null;
}

/**
 * Sanitiza un error de Supabase/DB antes de devolverlo al cliente.
 * - En dev: detail explícito para debug.
 * - En prod: mensaje genérico, log server-side.
 */
export function sanitizeDbError(
  err: { message?: string; code?: string } | null | undefined,
  fallback = 'operation_failed'
): { error: string; detail: string } {
  if (!err) return { error: fallback, detail: 'unknown' };
  if (process.env.NODE_ENV !== 'production') {
    return { error: fallback, detail: err.message ?? err.code ?? 'unknown' };
  }
  // eslint-disable-next-line no-console
  console.error('[db] error:', err.code, err.message);
  // Casos especiales user-facing
  if (err.code === '23505') return { error: 'duplicate', detail: 'Recurso duplicado.' };
  if (err.code === '23503') return { error: 'fk_violation', detail: 'Referencia inválida.' };
  if (err.code === '42501') return { error: 'forbidden', detail: 'Sin permisos para esta operación.' };
  return { error: fallback, detail: 'Operación fallida. Reintenta.' };
}
