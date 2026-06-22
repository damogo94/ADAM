/**
 * POST /api/agents/a4 — Consolidador A4 (re-narración).
 *
 * NO es el viejo orquestador (ese se retiró). Este endpoint recibe los
 * outputs YA calculados de A1/A2/A3 (+ debate opcional) y produce de nuevo
 * el A4Output: computeConfluence (determinístico) + narrateA4 (1 call Haiku).
 *
 * Razón de existir (2026-06): en el primer análisis de un ticker, /api/agents/run
 * corre con A2 desde caché fría → A2 null → A4 se hornea con "A2 no disponible"
 * y confluencia degradada. El frontend dispara /api/agents/a2 en paralelo; cuando
 * vuelve, llama aquí para re-narrar A4 con A1+A2+A3 completos y dejar la tarjeta
 * A4 coherente con la confluencia (que el cliente ya recalcula en vivo).
 *
 * Mismas defensas que el resto de endpoints de agentes: CSRF + IP rate-limit + auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { narrateA4 } from '@/agents/a4/narrate';
import { computeConfluence, type DebateForConfluence } from '@/agents/a4/compute';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';
import { A1Output, A2Output, A3Output } from '@/agents/shared/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// debate sólo se consume por convergence_score + direccion (DebateForConfluence).
// Schema laxo (passthrough) para no acoplar a la forma completa de DebateOutput.
const DebateLite = z
  .object({
    convergence_score: z.number(),
    direccion: z.enum(['alcista', 'bajista', 'neutral']),
  })
  .passthrough();

const RequestSchema = z.object({
  ticker: z.string().min(1).max(20).regex(/^[A-Z0-9.\-/=^]+$/i, 'ticker invalido').toUpperCase(),
  a1: A1Output.nullable(),
  a2: A2Output.nullable(),
  a3: A3Output.nullable(),
  debate: DebateLite.nullable().optional(),
  // Si viene, este endpoint ACTUALIZA la fila de analyses_log con el A4
  // re-narrado (cierra el first-run A2 gap en persistencia). Opcional para
  // back-compat: sin id, solo re-narra y devuelve (comportamiento previo).
  analysisId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const csrf = checkSameOrigin(req);
    if (csrf) return csrf;
    const ipLimit = await rateLimitByIP(req, 'analysis');
    if (ipLimit) return ipLimit;

    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { ticker, a1, a2, a3, debate, analysisId } = parsed.data;

    // Necesitamos al menos un agente vivo para que A4 tenga algo que consolidar.
    if (!a1 && !a2 && !a3) {
      return NextResponse.json({ error: 'no_agents' }, { status: 400 });
    }

    const debateForCompute: DebateForConfluence | null = debate
      ? { convergence_score: debate.convergence_score, direccion: debate.direccion }
      : null;

    const confluence = computeConfluence({ a1, a2, a3, debate: debateForCompute });
    const a4 = await narrateA4({
      ticker,
      a1,
      a2,
      a3,
      debate: debateForCompute,
      confluence,
      failures: [],
    });

    // Cierra el first-run A2 gap en PERSISTENCIA: actualiza la fila ya insertada
    // por /api/agents/run (que se horneó con A2 null) para que las columnas que
    // lee la calibración (confluence_pct/direction/confidence) y los JSON
    // reflejen el A4 completo. Admin + filtro user_id = scoping seguro sin
    // depender de una policy UPDATE en RLS. Best-effort: un fallo aquí NO rompe
    // la re-narración que el frontend necesita.
    if (analysisId) {
      try {
        const admin = createSupabaseAdmin();
        await admin
          .from('analyses_log')
          .update({
            a2_output: a2,
            a4_output: a4,
            confluence_pct: a4.confluence.score_total_pct,
            confidence: a4.confianza,
            direction: a4.direccion,
          })
          .eq('id', analysisId)
          .eq('user_id', user.id);
      } catch (updErr) {
        // eslint-disable-next-line no-console
        console.error(
          '[a4-consolidate] persist update failed:',
          updErr instanceof Error ? updErr.message : updErr
        );
      }
    }

    return NextResponse.json({ a4 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    Sentry.captureException(err, { tags: { endpoint: 'api/agents/a4-consolidate' } });
    // eslint-disable-next-line no-console
    console.error('[a4-consolidate] failed:', msg);
    return NextResponse.json({ error: 'a4_failed', detail: msg }, { status: 500 });
  }
}
