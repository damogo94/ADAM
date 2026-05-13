import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, sanitizeDbError } from '@/lib/api-helpers';

export const runtime = 'nodejs';

/**
 * DELETE /api/watchlist/[itemId] → elimina un item de la watchlist.
 * RLS garantiza que sólo el dueño puede borrar.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  const { itemId } = params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase.from('watchlist_items').delete().eq('id', itemId);
  if (error) {
    return NextResponse.json(sanitizeDbError(error, 'delete_failed'), { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
