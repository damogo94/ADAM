import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, sanitizeDbError } from '@/lib/api-helpers';

export const runtime = 'nodejs';

/**
 * POST /api/signals/[id]/ack → marca una signal como acknowledged.
 * RLS garantiza que sólo el dueño puede tocarla.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  const { id } = params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const patch = { acknowledged_at: new Date().toISOString() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('signals_history') as any)
    .update(patch)
    .eq('id', id);

  if (error) {
    return NextResponse.json(sanitizeDbError(error, 'update_failed'), { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
