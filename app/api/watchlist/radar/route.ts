/**
 * GET /api/watchlist/radar
 *
 * Devuelve el estado consolidado del Watchlist Radar:
 *   - Filas (item + latest_analysis + previous_analysis + signal + quote + delta + distances + is_stale)
 *   - Digest "3 cosas que mirar hoy" (cabecera)
 *
 * Arquitectura:
 *   1. RPC `get_watchlist_radar()` → 1 round-trip a Postgres con todo
 *      lo necesario por ticker (items + latest + previous + signal).
 *   2. En paralelo, `fallbackQuote(ticker)` por cada item para obtener
 *      precio actual y poder calcular distancias.
 *   3. `buildRow()` ensambla y normaliza cada fila. `buildDigest()`
 *      compone el top-3.
 *
 * Auth + rate limit:
 *   - rateLimitByIP(req, 'quote')  → 60/min/IP, endpoint barato.
 *   - Supabase cookie session     → user ID para que RLS aplique.
 *   - La RPC usa `auth.uid()` internamente; defense in depth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitByIP } from '@/lib/api-helpers';
import { fallbackQuote } from '@/lib/market/finnhub';
import { buildRow } from '@/lib/radar/build-row';
import { buildDigest } from '@/lib/radar/digest';
import {
  RpcRadarRow,
  type RadarQuote_t,
  type RadarResponse_t,
  type RadarSignalOutcome_t,
} from '@/lib/radar/types';
import type { SignalTradeOutcome } from '@/types/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cap defensivo de filas. Si en el futuro permitimos > 50 items por
// watchlist, deberíamos paginar o evitar la query de quotes para ítems
// fuera del viewport. Por ahora con N≤20 (cap habitual) sobra.
const MAX_ROWS = 50;

const RpcResponseSchema = z.array(RpcRadarRow);

export async function GET(req: NextRequest) {
  // 1) Rate limit (barato — quote bucket)
  const rl = await rateLimitByIP(req, 'quote');
  if (rl) return rl;

  // 2) Auth
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 3) RPC — 1 round-trip. El resultado se valida igualmente con Zod abajo.
  const { data, error } = await supabase.rpc('get_watchlist_radar');
  if (error) {
    return NextResponse.json(
      { error: 'rpc_failed', detail: error.message },
      { status: 500 }
    );
  }

  const parsed = RpcResponseSchema.safeParse(data ?? []);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_rpc_response', detail: parsed.error.issues.slice(0, 3) },
      { status: 500 }
    );
  }

  const rpcRows = parsed.data.slice(0, MAX_ROWS);

  // 4) Quotes paralelos. fallbackQuote ya está cubierto con .catch → null.
  const quotes = await Promise.all(
    rpcRows.map(async (r): Promise<RadarQuote_t | null> => {
      const q = await fallbackQuote(r.ticker).catch(() => null);
      if (!q) return null;
      return {
        current: q.current,
        change_pct_24h: q.change_pct_24h,
        currency: 'currency' in q ? q.currency : undefined,
      };
    })
  );

  // 5) Ensamblar filas + digest
  const now = new Date();
  const rows = rpcRows.map((r, i) => buildRow(r, quotes[i] ?? null, now));

  // 6) Enriquecer cada fila con el outcome de backtest de su señal.
  //
  // Los signal.id ya vienen filtrados por RLS vía la RPC `get_watchlist_radar`
  // (auth.uid()), así que acotar la lectura de outcomes a esos ids garantiza
  // que NO se traen resultados de señales de otros usuarios — mismo patrón
  // anti-fuga que /api/signals: admin client bypassa las policies de la tabla
  // service-role-only, pero el .in() limita a ids que ya son del user.
  const signalIds = rows
    .map((r) => r.signal?.id)
    .filter((id): id is string => typeof id === 'string');

  if (signalIds.length > 0) {
    const admin = createSupabaseAdmin();
    const { data: outcomes, error: outErr } = await admin
      .from('signal_trade_outcomes')
      .select('*')
      .in('signal_id', signalIds)
      .returns<SignalTradeOutcome[]>();
    // Best-effort: si falla la lectura, las filas quedan con outcome=null
    // (la UI degrada a "en seguimiento") en vez de romper el radar.
    if (!outErr) {
      const outcomeBySignal = new Map<string, RadarSignalOutcome_t>();
      for (const o of outcomes ?? []) {
        outcomeBySignal.set(o.signal_id, {
          outcome: o.outcome,
          r_multiple: o.r_multiple,
          return_pct: o.return_pct,
          resolved_days: o.resolved_days,
        });
      }
      for (const r of rows) {
        if (r.signal) r.signal.outcome = outcomeBySignal.get(r.signal.id) ?? null;
      }
    }
  }

  const digest = buildDigest(rows);

  const body: RadarResponse_t = {
    rows,
    digest,
    generated_at: now.toISOString(),
  };

  return NextResponse.json(body, {
    headers: {
      // Privado: este endpoint depende del user autenticado.
      'Cache-Control': 'private, no-store',
    },
  });
}
