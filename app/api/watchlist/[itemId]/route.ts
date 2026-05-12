import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * DELETE /api/watchlist/[itemId] → elimina un item de la watchlist.
 * RLS garantiza que sólo el dueño puede borrar.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await ctx.params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase.from('watchlist_items').delete().eq('id', itemId);
  if (error) {
    return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
