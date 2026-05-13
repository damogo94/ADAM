import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runA2 } from '@/agents/a2/client';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z
  .object({
    ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/]+$/i, 'ticker invalido').toUpperCase(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const { ticker } = parsed.data;

  // TODO Sprint 2: pull macro snapshot from Finnhub /economic-data + Fed/ECB feeds
  // For Sprint 1 MVP, the model uses its training knowledge with the ticker
  // as anchor; we can pass any macro datapoints we have.
  const macro_snapshot = {
    fed_funds_rate_pct: undefined,
    us_10y_yield_pct: undefined,
  };

  try {
    const result = await runA2({ ticker, macro_snapshot });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'A2 failed', detail: msg }, { status: 500 });
  }
}
