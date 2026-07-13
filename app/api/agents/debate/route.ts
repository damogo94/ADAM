import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runDebate } from '@/agents/debate/client';
import { A1Output as A1_OUTPUT_SCHEMA, A2Output as A2_OUTPUT_SCHEMA } from '@/agents/shared/types';
import { requireApiUser } from '@/lib/auth/api-user';

export const runtime = 'nodejs';
export const maxDuration = 60;

// .strict() en paridad con el resto de endpoints de agentes (rechaza extras).
const RequestSchema = z
  .object({
    a1: A1_OUTPUT_SCHEMA,
    a2: A2_OUTPUT_SCHEMA,
  })
  .strict();

export async function POST(req: NextRequest) {
  const gate = await requireApiUser(req);
  if (gate instanceof NextResponse) return gate;

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
