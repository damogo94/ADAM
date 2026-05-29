/**
 * Cache de output de A2 — evita llamadas repetidas a Anthropic cuando
 * los inputs (ticker + macro snapshot) no han cambiado.
 *
 * Idempotente sobre (ticker, macro_as_of). Cuando FRED publica datos
 * nuevos (rota `macro.as_of`), el cache se invalida orgánicamente
 * sin DELETE — la entrada vieja queda como histórico inerte.
 *
 * Shared entre usuarios: A2 contextualiza "macro × ticker" sin info
 * personal. Misma respuesta para todos.
 *
 * Failure modes (todos best-effort, jamás tiran):
 *   - DB down en read → cache miss → caller llama Anthropic. Coste extra
 *     en latencia y tokens pero no rompe nada.
 *   - DB down en write → A2 funciona, próxima petición re-llama Anthropic.
 *   - Cache hit pero payload no parsea schema → ignoramos y llamamos
 *     Anthropic. Cubre el caso de cambios al A2Output schema.
 */

import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { A2Output, type A2Output_t } from '@/agents/shared/types';

interface CacheRow {
  output: unknown;
}

/**
 * Lee cache si existe y el payload pasa validación contra el schema vigente.
 * Devuelve null en cualquier failure (best-effort).
 */
export async function readA2Cache(
  ticker: string,
  macroAsOf: string
): Promise<A2Output_t | null> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from('a2_cache')
      .select('output')
      .eq('ticker', ticker)
      .eq('macro_as_of', macroAsOf)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as CacheRow;
    // Valida contra schema vigente — si A2Output evoluciona y el cache
    // tiene un shape antiguo, evicta gracefully (caller llama Anthropic).
    const parsed = A2Output.safeParse(row.output);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.warn(
        `[a2-cache] stale schema for ${ticker}@${macroAsOf} — evicting via miss`
      );
      return null;
    }
    return parsed.data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[a2-cache] read failed:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Persiste output validado. Upsert por (ticker, macro_as_of).
 * Best-effort: failure NO se propaga al caller.
 */
export async function writeA2Cache(
  ticker: string,
  macroAsOf: string,
  output: A2Output_t
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    await admin.from('a2_cache').upsert({
      ticker,
      macro_as_of: macroAsOf,
      output,
      cached_at: new Date().toISOString(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[a2-cache] write failed:',
      err instanceof Error ? err.message : err
    );
  }
}
