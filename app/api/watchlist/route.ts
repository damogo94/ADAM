import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getOrCreateDefaultWatchlist } from '@/lib/watchlist';
import { checkSameOrigin, rateLimitByIP, sanitizeDbError } from '@/lib/api-helpers';

export const runtime = 'nodejs';

/**
 * GET /api/watchlist → lista la watchlist default del usuario con sus items.
 * Auto-crea la lista si no existe (lazy init).
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const watchlist = await getOrCreateDefaultWatchlist(user.id);
  const { data: items } = await supabase
    .from('watchlist_items')
    .select('*')
    .eq('watchlist_id', watchlist.id)
    .order('position', { ascending: true });

  return NextResponse.json({ watchlist, items: items ?? [] });
}

const AddSchema = z.object({
  ticker: z.string().min(1).max(20).trim().toUpperCase(),
  asset_type: z.enum(['equity', 'etf', 'crypto', 'forex', 'commodity', 'bond']).default('equity'),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/watchlist → añade un ticker a la watchlist default.
 */
export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }

  const watchlist = await getOrCreateDefaultWatchlist(user.id);
  const { count } = await supabase
    .from('watchlist_items')
    .select('*', { count: 'exact', head: true })
    .eq('watchlist_id', watchlist.id);

  const { data, error } = await supabase
    .from('watchlist_items')
    .insert({
      watchlist_id: watchlist.id,
      ticker: parsed.data.ticker,
      asset_type: parsed.data.asset_type,
      notes: parsed.data.notes ?? null,
      position: count ?? 0,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'duplicate', detail: `${parsed.data.ticker} ya está en tu watchlist` }, { status: 409 });
    }
    return NextResponse.json(sanitizeDbError(error, 'insert_failed'), { status: 500 });
  }

  return NextResponse.json({ item: data });
}
