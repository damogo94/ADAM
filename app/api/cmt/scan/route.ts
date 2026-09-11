import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { buildCMTSignal } from '@/agents/cmt/build-signal';
import { fallbackDaily, fallbackIntraday } from '@/lib/market/finnhub';
import { checkSameOrigin, rateLimitByIP, isCronRequest } from '@/lib/api-helpers';
import { inferSignalDirection, type SignalDirection } from '@/lib/backtest/signal-plan';
import { isCryptoTicker } from '@/lib/market/crypto-registry';
import type { CMTOutput } from '@/agents/cmt/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Scanner CMT — dos modos:
 *
 * A) MANUAL: usuario autenticado (cookie session) → escanea SU watchlist default
 *    POST /api/cmt/scan
 *
 * B) CRON: Vercel cron via header `Authorization: Bearer ${CRON_SECRET}` →
 *    itera TODAS las watchlists de TODOS los users, escanea, persiste por user_id.
 *    Vercel cron manda el header automaticamente cuando CRON_SECRET esta en env.
 *
 * Estrategia anti-spam Yahoo (sin cuota oficial pero no abusar):
 *   - 1s entre tickers (politeness, no rate-limit hard)
 *   - circuit breaker: 3 fallos consecutivos → break del loop
 *
 * Persiste solo signals NO `sin_senal` para no ruido en /signals.
 *
 * DEDUP (plan de precisión 2026-09 · R3): el scan corre a diario y, sin vela
 * nueva o con la misma estructura, regeneraba la MISMA señal cada día — cada
 * copia entraba luego en `signal_trade_outcomes` como un trade independiente e
 * inflaba n. Antes de insertar se descarta toda señal que ya exista para el
 * mismo (user_id, ticker) en los últimos 30 días con la misma dirección,
 * entry_price ±1% y target_price ±1% y que AÚN NO tenga fila de outcome (una
 * señal ya evaluada puede reemitirse: es un setup nuevo). La lectura de
 * outcomes va acotada con `.in('signal_id', ids)` a ids del propio user (patrón
 * del radar). Best-effort: si falla la lectura, se inserta sin dedup (log).
 *
 * FIN DE SEMANA (R13): en el path cron, los tickers NO crypto se saltan cuando
 * el día UTC es sábado o domingo — no hay vela nueva y se reemitía la vela del
 * viernes. Crypto cotiza 24/7 y pasa. Desactivable con
 * `CMT_SCAN_SKIP_WEEKEND=false` (default ON). El path manual no se ve afectado.
 *
 * El análisis es 100% DETERMINISTA (buildCMTSignal → computeTechnical, el motor
 * de A3): cero LLM, R/B≥1.5 forzado en código. La señal siempre es '1D'; el
 * intraday alimenta el MTF (no genera señales 1H, que el cron no evalúa).
 */

// Antes 13s para no quemar AV (5/min). Yahoo no tiene cuota free oficial
// pero 1s entre llamadas es buena ciudadanía y respeta el lambda timeout.
const SLEEP_MS_BETWEEN_TICKERS = 1_000;
const MAX_CONSECUTIVE_FAILS = 3;

/** Ventana de dedup: coincide con la ventana de evaluación 1D del cron (30d). */
const DEDUP_WINDOW_DAYS = 30;
/** Tolerancia relativa para considerar "el mismo" entry / target. */
const DEDUP_TOLERANCE_PCT = 1;

// Helpers privados (un route.ts de Next solo puede exportar GET/POST/config).

/** Sábado (6) o domingo (0) en UTC — el cron corre a las 21:00 UTC. */
function isWeekendUtc(now: Date = new Date()): boolean {
  const d = now.getUTCDay();
  return d === 0 || d === 6;
}

/**
 * `CMT_SCAN_SKIP_WEEKEND` — default ON. Solo `false`/`0`/`off` lo desactivan.
 * Se lee por request (no en import) para que sea testeable y para que un cambio
 * en Vercel env aplique sin depender del orden de carga del módulo.
 */
function isWeekendSkipEnabled(): boolean {
  const raw = (process.env.CMT_SCAN_SKIP_WEEKEND ?? '').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

interface ScanResult {
  ticker: string;
  ok: boolean;
  signal?: CMTOutput;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scanTickerForUser(userId: string, ticker: string): Promise<ScanResult> {
  try {
    // Yahoo /v8/chart sirve daily + intraday sin auth ni cuota práctica.
    // Daily '1y' (~250 velas) → SMA200 computable. Intraday (60m·5d) → MTF.
    const [daily, intraday] = await Promise.all([
      fallbackDaily(ticker, '1y').catch(() => []),
      fallbackIntraday(ticker).catch(() => []),
    ]);
    // La señal sale del compute DIARIO → daily es obligatorio (intraday solo
    // alimenta el MTF, opcional).
    if (daily.length === 0) {
      return { ticker, ok: false, error: 'no_market_data' };
    }
    const ohlcv = daily.map((d) => ({ t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v }));
    const intradayCandles = intraday.map((d) => ({ t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v }));
    // Determinista y síncrono — sin LLM. El intraday NO genera señal 1H; solo MTF.
    const signal = buildCMTSignal({ ticker, ohlcv, intraday: intradayCandles });
    return { ticker, ok: true, signal };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return { ticker, ok: false, error: msg };
  }
}

/** Niveles mínimos para comparar dos señales (los tres pueden ser null en DB). */
interface SignalLevels {
  entry_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
}

/**
 * Dirección de una señal desde su geometría — el mismo criterio que el backtest
 * (`inferSignalDirection`: target arriba y stop abajo → buy; al revés → sell).
 * Sin stop persistido cae a target vs entry. null si no hay entry/target.
 */
function signalDirection(s: SignalLevels): SignalDirection | null {
  if (s.entry_price == null || s.target_price == null) return null;
  if (s.stop_loss != null) return inferSignalDirection(s.entry_price, s.stop_loss, s.target_price);
  if (s.target_price === s.entry_price) return null;
  return s.target_price > s.entry_price ? 'buy' : 'sell';
}

/** |a − b| / |b| ≤ tol%. Con b = 0 solo iguala si a también es 0. */
function withinPct(a: number, b: number, tolPct: number): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= tolPct / 100;
}

/**
 * ¿Es `candidate` la misma señal que `existing`? Misma dirección, entry ±1% y
 * target ±1%. Señales sin entry/target (no debería pasar con level≠sin_senal)
 * nunca se consideran duplicadas — mejor insertar de más que perder rastro.
 */
function isSameSignal(candidate: SignalLevels, existing: SignalLevels): boolean {
  const dir = signalDirection(candidate);
  if (dir == null || dir !== signalDirection(existing)) return false;
  return (
    withinPct(candidate.entry_price!, existing.entry_price!, DEDUP_TOLERANCE_PCT) &&
    withinPct(candidate.target_price!, existing.target_price!, DEDUP_TOLERANCE_PCT)
  );
}

interface PersistResult {
  persisted: number;
  deduped: number;
}

async function persistSignals(userId: string, results: ScanResult[]): Promise<PersistResult> {
  const admin = createSupabaseAdmin();
  const candidates = results
    .filter((r) => r.ok && r.signal && r.signal.level !== 'sin_senal')
    .map((r) => {
      const s = r.signal!;
      return {
        user_id: userId,
        ticker: s.ticker,
        level: s.level,
        timeframe: s.timeframe,
        setup_detected: s.setup_detected,
        confidence_pct: s.confidence_pct,
        entry_type: s.entry_type,
        entry_price: s.entry_price,
        stop_loss: s.stop_loss,
        target_price: s.target_price,
        risk_reward_ratio: s.risk_reward_ratio,
        invalidation_factor: s.invalidation_factor,
        indicators: s.indicators,
      };
    });

  if (candidates.length === 0) return { persisted: 0, deduped: 0 };

  // ── Dedup (R3) ────────────────────────────────────────────────────
  // 1) Señales recientes del MISMO user para los tickers candidatos. Acotado
  //    por user_id + .in(ticker) → nunca lee señales de otros users.
  const tickers = Array.from(new Set(candidates.map((c) => c.ticker)));
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from('signals_history')
    .select('id, ticker, entry_price, stop_loss, target_price')
    .eq('user_id', userId)
    .in('ticker', tickers)
    .gte('emitted_at', sinceIso);

  // 2) De esas, cuáles YA tienen outcome — `.in()` acotado a ids que acabamos de
  //    leer bajo el filtro de user_id (mismo patrón anti-fuga que el radar).
  let openRecent = recent ?? [];
  let outcomesErr: string | null = null;
  if (openRecent.length > 0) {
    const ids = openRecent.map((r) => r.id);
    const { data: outcomes, error } = await admin
      .from('signal_trade_outcomes')
      .select('signal_id')
      .in('signal_id', ids);
    if (error) {
      outcomesErr = error.message;
    } else {
      const evaluated = new Set((outcomes ?? []).map((o) => o.signal_id));
      openRecent = openRecent.filter((r) => !evaluated.has(r.id));
    }
  }

  let toInsert = candidates;
  let deduped = 0;
  if (recentErr || outcomesErr) {
    // Best-effort: sin lectura fiable no deduplicamos (comportamiento histórico).
    // eslint-disable-next-line no-console
    console.warn('[cmt-scan] dedup lookup failed, inserting without dedup:', recentErr?.message ?? outcomesErr);
  } else {
    toInsert = candidates.filter((c) => {
      const dup = openRecent.some((r) => r.ticker === c.ticker && isSameSignal(c, r));
      if (dup) deduped++;
      return !dup;
    });
    if (deduped > 0) {
      // eslint-disable-next-line no-console
      console.info(`[cmt-scan] dedup: ${deduped}/${candidates.length} señales ya abiertas (<${DEDUP_WINDOW_DAYS}d, ±${DEDUP_TOLERANCE_PCT}%) para user ${userId}`);
    }
  }

  if (toInsert.length === 0) return { persisted: 0, deduped };
  const { error } = await admin.from('signals_history').insert(toInsert);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[cmt-scan] persist failed:', error.message);
    return { persisted: 0, deduped };
  }
  return { persisted: toInsert.length, deduped };
}

export async function POST(req: NextRequest) {
  // Dual cron+manual: si trae el Bearer de cron válido, va al path de cron; si no,
  // NO 401ea (caería al path manual cookie-auth). Ver isCronRequest (no fail-closed).
  if (isCronRequest(req)) {
    return handleCron();
  }

  // CSRF aplica SOLO en path manual — cron viene de Vercel sin Origin
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;

  // Rate-limit del path MANUAL (cookie-auth): el scan es CARO (loop con sleep
  // 1s/ticker sobre toda la watchlist) y era el único mutante autenticado sin
  // throttle. Bucket 'analysis' = 5/min + 30/día/IP. (Auditoría Fase 0 · #1.)
  const rl = await rateLimitByIP(req, 'analysis');
  if (rl) return rl;

  // Opcional: body `{ tickers: string[] }` para limitar el scan a un
  // subset (selección desde /signals). Sin body → escanea TODA la
  // watchlist (comportamiento histórico).
  let selectedTickers: string[] | null = null;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { tickers?: unknown };
      if (Array.isArray(body.tickers)) {
        const arr = body.tickers
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim().toUpperCase());
        if (arr.length > 0) {
          // Cap defensivo a 5 — el UI ya lo limita, esto blindaje server.
          selectedTickers = arr.slice(0, 5);
        }
      }
    }
  } catch {
    // Body inválido → ignorar y escanear watchlist completa (degrada en seguro)
  }

  return handleManual(selectedTickers);
}

/**
 * GET también soportado para cron — Vercel cron por defecto usa GET.
 */
export async function GET(req: NextRequest) {
  // GET solo para cron (Vercel cron usa GET por defecto); manual usa POST.
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'method_not_allowed', detail: 'GET solo para cron autenticado' }, { status: 405 });
  }
  return handleCron();
}

async function handleManual(selectedTickers: string[] | null = null) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: watchlist } = await supabase
    .from('watchlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle<{ id: string }>();
  if (!watchlist) return NextResponse.json({ scanned: 0, persisted: 0, results: [] });

  const { data: items } = await supabase
    .from('watchlist_items')
    .select('ticker')
    .eq('watchlist_id', watchlist.id)
    .returns<{ ticker: string }[]>();
  const allTickers = (items ?? []).map((it) => it.ticker);

  // Si vino selección, intersección con la watchlist del user (defense in
  // depth — el user solo puede escanear tickers que están en su lista).
  // Sin selección → escanea toda la watchlist (comportamiento histórico).
  const tickers = selectedTickers
    ? allTickers.filter((t) => selectedTickers.includes(t.toUpperCase()))
    : allTickers;

  const { results } = await runScanLoop(user.id, tickers);
  const { persisted, deduped } = await persistSignals(user.id, results);

  return NextResponse.json({
    scanned: results.length,
    persisted,
    deduped,
    selected: selectedTickers !== null,
    results,
  });
}

async function handleCron() {
  // Cron itera TODAS las watchlists default. Service role bypasses RLS para leer cross-user.
  const admin = createSupabaseAdmin();
  const wlRes = await admin
    .from('watchlists')
    .select('id, user_id')
    .eq('is_default', true);
  const watchlists = wlRes.data ?? [];

  if (watchlists.length === 0) {
    return NextResponse.json({ users_scanned: 0, total_persisted: 0, total_deduped: 0, skipped_weekend: 0 });
  }

  // R13: sáb/dom UTC no hay vela nueva para no-crypto → saltarlos (crypto pasa).
  const skipNonCrypto = isWeekendSkipEnabled() && isWeekendUtc();

  let totalScanned = 0;
  let totalPersisted = 0;
  let totalDeduped = 0;
  let totalSkippedWeekend = 0;
  const errors: { user_id: string; error: string }[] = [];

  for (const wl of watchlists) {
    try {
      const itemsRes = await admin
        .from('watchlist_items')
        .select('ticker')
        .eq('watchlist_id', wl.id);
      const items = itemsRes.data ?? [];
      const allTickers = items.map((it) => it.ticker);

      let tickers = allTickers;
      if (skipNonCrypto) {
        const skipped = allTickers.filter((t) => !isCryptoTicker(t));
        if (skipped.length > 0) {
          totalSkippedWeekend += skipped.length;
          // eslint-disable-next-line no-console
          console.info(`[cmt-scan] weekend skip (UTC): ${skipped.length} no-crypto sin vela nueva para user ${wl.user_id}: ${skipped.join(', ')}`);
        }
        tickers = allTickers.filter((t) => isCryptoTicker(t));
      }
      if (tickers.length === 0) continue;

      const { results } = await runScanLoop(wl.user_id, tickers);
      totalScanned += results.length;
      const { persisted, deduped } = await persistSignals(wl.user_id, results);
      totalPersisted += persisted;
      totalDeduped += deduped;
    } catch (err) {
      errors.push({ user_id: wl.user_id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({
    users_scanned: watchlists.length,
    total_scanned: totalScanned,
    total_persisted: totalPersisted,
    total_deduped: totalDeduped,
    skipped_weekend: totalSkippedWeekend,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function runScanLoop(userId: string, tickers: string[]): Promise<{ results: ScanResult[] }> {
  const results: ScanResult[] = [];
  let avFailStreak = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!;
    const r = await scanTickerForUser(userId, ticker);
    results.push(r);

    if (!r.ok && (r.error?.includes('soft error') || r.error?.includes('rate-limited'))) {
      avFailStreak++;
      if (avFailStreak >= MAX_CONSECUTIVE_FAILS) {
        // eslint-disable-next-line no-console
        console.warn(`[cmt-scan] AV throttling streak (${avFailStreak}), breaking scan at ticker ${i + 1}/${tickers.length}`);
        break;
      }
    } else if (r.ok) {
      avFailStreak = 0;
    }

    // Spacing entre tickers — respeta AV 5/min con margen
    if (i < tickers.length - 1) await sleep(SLEEP_MS_BETWEEN_TICKERS);
  }

  return { results };
}
