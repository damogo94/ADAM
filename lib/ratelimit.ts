import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiters singleton.
 *
 * Behaviour:
 *  - Si Upstash env vars están presentes → ratelimit real
 *  - Si NO → noop (permite todo). Útil en dev local sin cuenta Upstash.
 *
 * Quotas:
 *  - analysis: 10 / minuto / IP   (POST /api/agents/a4 — caro)
 *  - quote:    60 / minuto / IP   (GET /api/market/* — barato)
 */

type RatelimitLike = {
  limit(key: string): Promise<{ success: boolean; remaining: number; limit: number; reset: number }>;
};

const NOOP_LIMITER: RatelimitLike = {
  async limit() {
    return { success: true, remaining: 99, limit: 99, reset: Date.now() + 60_000 };
  },
};

function buildLimiter(window: `${number} ${'s' | 'm' | 'h'}`, tokens: number, prefix: string): RatelimitLike {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return NOOP_LIMITER;
  }
  const redis = new Redis({ url, token });
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
};
