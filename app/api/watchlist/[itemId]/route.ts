import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, rateLimitByIP, sanitizeDbError } from '@/lib/api-helpers';

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

  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

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

/**
 * PATCH /api/watchlist/[itemId] → actualiza un item.
 *
 * Por ahora solo soporta is_pinned (migración 0008). El esquema admite
 * crecimiento futuro sin tener que cambiar el contrato — añadir campos
 * opcionales al PatchSchema.
 *
 * pinned_at se rellena server-side al pinar y se anula al despinar — no
 * lo aceptamos del cliente para evitar manipulación de orden.
 */
const PatchSchema = z
  .object({
    is_pinned: z.boolean().optional(),
  })
  .strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

  const { itemId } = params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  if (parsed.data.is_pinned === undefined) {
    return NextResponse.json({ error: 'no_op', detail: 'nada que actualizar' }, { status: 400 });
  }

  // pinned_at se calcula server-side: timestamp actual si pin, null si unpin.
  const patch = {
    is_pinned: parsed.data.is_pinned,
    pinned_at: parsed.data.is_pinned ? new Date().toISOString() : null,
  };

  // Cast del from() siguiendo el patrón existente en /api/signals/[id]/ack.
  // El cliente Supabase tipado genera 'never' en .update() cuando los tipos
  // Insert/Update no se infieren bien — hasta migrar a `supabase gen types`,
  // este cast localizado es el menor mal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('watchlist_items') as any)
    .update(patch)
    .eq('id', itemId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(sanitizeDbError(error, 'update_failed'), { status: 500 });
  }
  return NextResponse.json({ item: data });
}
