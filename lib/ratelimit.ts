import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiters singleton.
 *
 * Behaviour:
 *  - Si Upstash env vars están presentes → ratelimit real (Upstash sliding-window)
 *  - Si NO:
 *      • dev (NODE_ENV !== 'production') → noop con warn
 *      • prod → throw on import so deploy falla loud
 *
 * Quotas:
 *  - analysis: 10 / minuto / IP   (POST /api/agents/a4 — caro, IP-level burst guard)
 *  - quote:    60 / minuto / IP   (GET /api/market/* — barato)
 *  - userRuns: 20 / día / user.id (POST /api/agents/a4 — abuse-vector defense)
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

function buildLimiter(window: `${number} ${'s' | 'm' | 'h' | 'd'}`, tokens: number, prefix: string): RatelimitLike {
  const redis = getRedis();
  if (!redis) {
    if (isProd) {
      throw new Error(
        `[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN missing in production. Refusing to start with rate-limit disabled (security risk).`
      );
    }
    // eslint-disable-next-line no-console
    console.warn(`[ratelimit] Upstash creds missing — using NOOP limiter for "${prefix}" (dev only).`);
    return NOOP_LIMITER;
  }
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix,
  });
}

export const limiters = {
  analysis: buildLimiter('1 m', 10, 'adam:analysis'),
  quote: buildLimiter('1 m', 60, 'adam:quote'),
  userRuns: buildLimiter('1 d', 20, 'adam:user-runs'),
};

/**
 * Cliente Redis directo (no Ratelimit) para casos donde necesitamos counters
 * arbitrarios (ej. token usage tracking, AV cache write-through L2).
 * Devuelve null si Upstash no está configurado — caller debe fallback.
 */
export function getRedisClient(): Redis | null {
  return getRedis();
}
