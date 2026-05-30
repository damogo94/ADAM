import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiters — inicialización LAZY (diferida a la primera invocación).
 *
 * Antes: construíamos los limiters al importar el módulo. En prod sin
 * UPSTASH_* envs, eso lanza al cargar y `middleware.ts` (que importa este
 * módulo) hace que TODA request 500 antes del handler. Ahora: build on first
 * use, con caché in-process por (window, tokens, prefix).
 *
 * Behaviour:
 *  - Con Upstash configurado → real Ratelimit sliding-window
 *  - Sin Upstash:
 *      • dev (NODE_ENV !== 'production') → NOOP_LIMITER con warn
 *      • prod → throw al primer .limit() (fail-closed, seguridad sobre availability)
 *
 * Quotas (sesión 6d — tightened):
 *  - analysis:      5 / minuto / IP    (POST /api/agents/run — caro)
 *  - analysisDaily: 30 / día / IP      (POST /api/agents/run — cap diario sin auth)
 *  - quote:         60 / minuto / IP   (GET /api/market/* — barato)
 *  - userRuns:      30 / día / user.id (POST /api/agents/run — defensa adicional con auth)
 */

type RatelimitLike = {
  limit(key: string): Promise<{ success: boolean; remaining: number; limit: number; reset: number }>;
};

const NOOP_LIMITER: RatelimitLike = {
  async limit() {
    return { success: true, remaining: 99, limit: 99, reset: Date.now() + 60_000 };
  },
};

const isProd = process.env.NODE_ENV === 'production';

let redisSingleton: Redis | null = null;
function getRedis(): Redis | null {
  if (redisSingleton) return redisSingleton;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}

const limiterCache = new Map<string, RatelimitLike>();

function getOrBuildLimiter(
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`,
  tokens: number,
  prefix: string
): RatelimitLike {
  const cacheKey = `${prefix}:${window}:${tokens}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  const redis = getRedis();
  if (!redis) {
    if (isProd) {
      // Lanza en uso, no en import. Antes era un import-time throw que poisoneaba
      // todas las rutas. Ahora solo falla la request que llega sin Upstash configurado.
      throw new Error(
        `[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN missing in production. Refusing to serve "${prefix}" with rate-limit disabled (security risk).`
      );
    }
    // eslint-disable-next-line no-console
    console.warn(`[ratelimit] Upstash creds missing — using NOOP limiter for "${prefix}" (dev only).`);
    limiterCache.set(cacheKey, NOOP_LIMITER);
    return NOOP_LIMITER;
  }

  const real = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix,
  });
  limiterCache.set(cacheKey, real);
  return real;
}

/**
 * Limiters expuestos como getters → construidos en primer acceso, NO en import.
 * Esto evita que un fallo de inicialización derribe `middleware.ts` y por extensión
 * todas las rutas Edge/Node que lo importan transitivamente.
 */
export const limiters = {
  get analysis() {
    return getOrBuildLimiter('1 m', 5, 'adam:analysis');
  },
  get analysisDaily() {
    return getOrBuildLimiter('1 d', 30, 'adam:analysis-daily');
  },
  get quote() {
    return getOrBuildLimiter('1 m', 60, 'adam:quote');
  },
  get userRuns() {
    return getOrBuildLimiter('1 d', 30, 'adam:user-runs');
  },
};

/**
 * Cliente Redis directo (no Ratelimit) para casos donde necesitamos counters
 * arbitrarios — ej. circuit breaker AV, token usage tracking.
 * Devuelve null si Upstash no está configurado — caller debe fallback.
 */
export function getRedisClient(): Redis | null {
  return getRedis();
}
