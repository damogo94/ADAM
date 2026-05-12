import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { SignalHistory } from '@/types/db';

export const runtime = 'nodejs';

/**
 * GET /api/signals → últimas 50 signals del user autenticado.
 * RLS filtra automáticamente por user_id = auth.uid().
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('signals_history')
    .select('*')
    .order('emitted_at', { ascending: false })
    .limit(50)
    .returns<SignalHistory[]>();

  if (error) {
    return NextResponse.json({ error: 'fetch_failed', detail: error.message }, { status: 500 });
  }

  // Stats
  const stats = {
    urgente: 0,
    atencion: 0,
    monitorear: 0,
  };
  for (const s of data ?? []) {
    if (!s.acknowledged_at && s.level !== 'sin_senal') {
      stats[s.level as 'urgente' | 'atencion' | 'monitorear']++;
    }
  }

  return NextResponse.json({ signals: data ?? [], stats });
}
