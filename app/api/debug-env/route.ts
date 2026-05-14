import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * ⚠️ TEMPORAL — endpoint de diagnóstico de env vars en runtime.
 *
 * Devuelve si CADA env var crítica está set en el lambda actual (sin leakear
 * el valor). Solo accesible para users autenticados — para no exponer la
 * topología de secrets a anónimos.
 *
 * BORRAR este archivo cuando confirmemos que el deploy ve todas las vars.
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const required = [
    'ANTHROPIC_API_KEY',
    'ALPHA_VANTAGE_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'SENTRY_DSN',
    'NEXT_PUBLIC_SENTRY_DSN',
    'CRON_SECRET',
  ];

  const status: Record<string, { present: boolean; length: number; preview: string }> = {};
  for (const k of required) {
    const v = process.env[k];
    status[k] = {
      present: !!v,
      length: v?.length ?? 0,
      preview: v ? v.slice(0, 6) + '...' + v.slice(-3) : '',
    };
  }

  // Ping en vivo a Upstash REST API — verifica que el token funcione, no solo que exista.
  let upstash_ping: { ok: boolean; error?: string; latency_ms?: number; value?: string } = {
    ok: false,
    error: 'not attempted',
  };
  try {
    const redis = getRedisClient();
    if (!redis) {
      upstash_ping = { ok: false, error: 'getRedisClient returned null (creds missing despite env vars)' };
    } else {
      const t0 = Date.now();
      const testKey = `adam:debug:${user.id}`;
      await redis.set(testKey, 'pong', { ex: 60 });
      const v = await redis.get<string>(testKey);
      upstash_ping = {
        ok: v === 'pong',
        latency_ms: Date.now() - t0,
        value: v ?? null!,
      };
    }
  } catch (err) {
    upstash_ping = {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : 'unknown',
    };
  }

  // Ping a Anthropic — verifica que la key sea valida (sin gastar tokens reales)
  let anthropic_ping: { ok: boolean; error?: string; latency_ms?: number; status?: number } = {
    ok: false,
    error: 'not attempted',
  };
  try {
    const t0 = Date.now();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'reply only: pong' }],
      }),
    });
    anthropic_ping = {
      ok: r.ok,
      status: r.status,
      latency_ms: Date.now() - t0,
      error: r.ok ? undefined : await r.text().then((t) => t.slice(0, 200)),
    };
  } catch (err) {
    anthropic_ping = {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : 'unknown',
    };
  }

  return NextResponse.json({
    env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
    vercel_region: process.env.VERCEL_REGION,
    runtime_node_version: process.version,
    vars: status,
    upstash_ping,
    anthropic_ping,
  });
}
