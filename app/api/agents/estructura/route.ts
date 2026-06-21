import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { narrateEstructura } from '@/agents/estructura/narrate';
import { resolveEstructuraSymbol } from '@/agents/estructura/symbols';
import { fallbackDaily, fallbackIntraday } from '@/lib/market/finnhub';
import { createSupabaseServer } from '@/lib/supabase/server';
import { checkSameOrigin, rateLimitByIP } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Endpoint del Agente de Estructura.
 *
 * Solo acepta { ticker }. Aislado igual que A3: NO acepta context, news, macro
 * ni sentiment (`.strict()` rechaza extras). El usuario puede teclear su
 * nomenclatura (XAUUSD, NAS100); el resolver la traduce al símbolo de datos de
 * Yahoo (GC=F, NQ=F) conservando la etiqueta en la salida.
 */
const RequestSchema = z
  .object({
    ticker: z
      .string()
      .min(1)
      .max(20)
      .regex(/^[A-Z0-9.\-/=^]+$/i, 'ticker invalido')
      .toUpperCase(),
  })
  .strict();

export async function POST(req: NextRequest) {
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

  // El usuario teclea su nomenclatura; resolvemos al símbolo de datos (futuros).
  const { display, dataSymbol } = resolveEstructuraSymbol(parsed.data.ticker);

  try {
    // 1 año de daily → histórico para agregar a semanal. Hourly = 5 días (H4/H1).
    const [daily, intraday] = await Promise.all([
      fallbackDaily(dataSymbol, '1y').catch(() => []),
      fallbackIntraday(dataSymbol).catch(() => []),
    ]);

    if (daily.length === 0) {
      return NextResponse.json(
        { error: 'no_market_data', detail: `Sin velas para ${display} (${dataSymbol}).` },
        { status: 422 }
      );
    }

    const result = await narrateEstructura({
      ticker: dataSymbol,
      ohlcv: daily,
      intraday: intraday.length > 0 ? intraday : undefined,
    });

    // Mostramos la nomenclatura que el usuario tecleó, no el símbolo de datos.
    // El compute usa dataSymbol (perfil correcto), pero la narrativa (incl. el
    // fallback determinista, que arranca con el ticker) debe lucir el display.
    const narrative =
      display !== dataSymbol ? result.narrative.split(dataSymbol).join(display) : result.narrative;
    return NextResponse.json({ ...result, ticker: display, narrative, data_symbol: dataSymbol });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Estructura failed', detail: msg }, { status: 500 });
  }
}
