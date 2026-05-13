import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin } from '@/lib/api-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
