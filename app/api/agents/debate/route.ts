import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runDebate } from '@/agents/debate/client';
import { A1Output as A1_OUTPUT_SCHEMA, A2Output as A2_OUTPUT_SCHEMA } from '@/agents/shared/types';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z.object({
  a1: A1_OUTPUT_SCHEMA,
  a2: A2_OUTPUT_SCHEMA,
});

export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const ipLimit = await rateLimitByIP(req, 'analysis');
  if (ipLimit) return ipLimit;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await runDebate(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Debate failed', detail: msg }, { status: 500 });
  }
}
