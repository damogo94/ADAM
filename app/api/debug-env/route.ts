import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

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

  return NextResponse.json({
    env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
    vercel_region: process.env.VERCEL_REGION,
    runtime_node_version: process.version,
    vars: status,
  });
}
