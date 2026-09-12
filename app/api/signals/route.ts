import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIP } from '@/lib/api-helpers';
import { computeTrackRecord } from '@/components/signals/helpers';
import type { SignalHistory, SignalTradeOutcome } from '@/types/db';

export const runtime = 'nodejs';

/** Señal + su outcome de trade (si ya se evaluó). outcome=null = en seguimiento / no seguida. */
export type SignalWithOutcome = SignalHistory & { outcome: SignalTradeOutcome | null };

/**
 * GET /api/signals → últimas 50 signals del user autenticado + su outcome +
 * `track` (track record por fila Y por cluster, mismo helper que la UI).
 *
 * RLS filtra las señales por user_id = auth.uid(). Los outcomes viven en
 * signal_trade_outcomes (service-role only, sin policies), así que se leen con
 * el admin client PERO acotados a los signal_ids del propio usuario (que ya
 * salieron de la query con RLS) → sin fuga de datos entre usuarios.
 *
 * `track` (R9): la cifra por fila está inflada por la reemisión diaria del
 * mismo nivel (cmt/scan). `track.clusters` colapsa ticker + dirección + entrada
 * ±1% + ≤CLUSTER_GAP_DAYS en una observación (fila más antigua = representativa)
 * y suma el R de esas representativas. Se calcula con `computeTrackRecord`
 * (components/signals/helpers.ts) — el MISMO helper que usa el radar — para que
 * API y UI publiquen el mismo número.
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

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

  const signals = data ?? [];

  // Outcomes acotados a las señales del usuario (admin bypassa RLS de la tabla
  // service-role-only, pero el IN limita a ids que ya son del user).
  const outcomeBySignal = new Map<string, SignalTradeOutcome>();
  if (signals.length > 0) {
    const admin = createSupabaseAdmin();
    const { data: outcomes, error: outErr } = await admin
      .from('signal_trade_outcomes')
      .select('*')
      .in('signal_id', signals.map((s) => s.id))
      .returns<SignalTradeOutcome[]>();
    // Best-effort: si falla la lectura de outcomes, devolvemos las señales sin
    // outcome (la página degrada a "en seguimiento") en vez de romper la vista.
    if (!outErr) {
      for (const o of outcomes ?? []) outcomeBySignal.set(o.signal_id, o);
    }
  }

  const merged: SignalWithOutcome[] = signals.map((s) => ({
    ...s,
    outcome: outcomeBySignal.get(s.id) ?? null,
  }));

  // Stats de niveles (señales sin leer, como antes).
  const stats = { urgente: 0, atencion: 0, monitorear: 0 };
  for (const s of signals) {
    if (!s.acknowledged_at && s.level !== 'sin_senal') {
      stats[s.level as 'urgente' | 'atencion' | 'monitorear']++;
    }
  }

  // Track record por fila y por cluster — ver docstring. Solo cuenta filas
  // resueltas (win/loss/timeout); no_fill y en seguimiento quedan fuera.
  const track = computeTrackRecord(merged);

  return NextResponse.json({ signals: merged, stats, track });
}
