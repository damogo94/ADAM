/**
 * Tests de /api/metrics/calibration — enforcement de la allowlist en la API
 * interna (la superficie de ataque que más se olvida: llamar directo sin pasar
 * por la página /system).
 *
 * Esta API usa service-role (createSupabaseAdmin, bypassa RLS) para leer
 * métricas cross-user → el gate es OBLIGATORIO. Verificamos que:
 *   - autorizado → 200 y se accede a los datos (admin llamado).
 *   - autenticado pero NO en allowlist → 403 y NUNCA se tocan los datos.
 *   - no autenticado → 401 y NUNCA se tocan los datos.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));

import { GET } from '../route';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { makeBuilder } from '@/test/helpers/route';

function serverClient(opts: { user: { id: string } | null; authorized: boolean }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.user }, error: null })) },
    rpc: vi.fn(async () => ({ data: opts.authorized, error: null })),
  };
}

// A3 válido con signal 'buy' (→ dirección alcista) y ATR para el umbral.
const A3_BUY = {
  ticker: 'AAPL',
  timeframes_analizados: ['1D'],
  tendencia: { primaria: 'alcista', secundaria: 'alcista', fuerza: 3 },
  soportes: [],
  resistencias: [],
  patron_detectado: null,
  medias: { sma20: null, sma50: null, sma200: null, vwap: null, golden_cross: false, death_cross: false },
  volumen: { estado: 'estable', comentario: 'volumen ok' },
  velas_relevantes: [],
  operativa: {
    signal: 'buy',
    entrada: 100,
    stop_loss: 95,
    target: 110,
    atr_actual: 2,
    ratio_riesgo_beneficio: 2,
    horizonte: 'swing',
  },
  factor_invalidacion: 'factor de invalidación de prueba.',
  confidence: 70,
  narrative: 'narrativa A3 suficientemente larga para validar.',
};

function outcomeRow(over: Record<string, unknown> = {}, logOver: Record<string, unknown> = {}) {
  return {
    analysis_id: 'an-1',
    horizon_days: 7,
    hit: true,
    return_pct: 5, // +5% > umbral 2% → alcista acierta
    analyses_log: {
      ticker: 'AAPL',
      created_at: '2026-06-01T21:00:00Z',
      direction: 'positivo',
      confidence: 'media',
      confluence_pct: 50,
      actionable_pct: 40,
      kappa: 0.5,
      initial_price: 100,
      a1_output: null,
      a2_output: null,
      a3_output: A3_BUY,
      estructura_output: null,
      ...logOver,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // admin: signal_outcomes.select(...).limit(...) → sin filas (suficiente).
  const builder = makeBuilder({ then: { data: [], error: null } });
  vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => builder) } as never);
});

describe('GET /api/metrics/calibration · allowlist', () => {
  it('usuario en la allowlist → 200 y accede a los datos', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: { id: 'u1' }, authorized: true }) as never
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('total');
    // Ejes nuevos (Fase 1) presentes en la respuesta.
    expect(body).toHaveProperty('by_actionable');
    expect(body).toHaveProperty('by_kappa');
    // Opción C · track-record per-agente.
    expect(body).toHaveProperty('by_agent');
    expect(body.by_agent).toHaveProperty('a3');
    expect(createSupabaseAdmin).toHaveBeenCalledTimes(1);
  });

  it('atribuye el acierto direccional al agente que tomó postura (A3 buy → alcista, +5% → hit)', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: { id: 'u1' }, authorized: true }) as never
    );
    const builder = makeBuilder({ then: { data: [outcomeRow()], error: null } });
    vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    // A3 opinó alcista y el activo subió +5% → cuenta y acierta.
    expect(body.by_agent.a3).toMatchObject({ n: 1, hits: 1, hit_rate_pct: 100 });
    // A1/A2/Estructura ausentes (null) → sin postura → no cuentan.
    expect(body.by_agent.a1.n).toBe(0);
    expect(body.by_agent.a2.n).toBe(0);
    expect(body.by_agent.estructura.n).toBe(0);
  });

  it('by_direction mapea el enum DB (positivo → alcista) — sin mapeo el bucket queda n=0', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: { id: 'u1' }, authorized: true }) as never
    );
    const builder = makeBuilder({ then: { data: [outcomeRow()], error: null } });
    vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    // La fila trae direction 'positivo' (vocabulario DB) → bucket alcista.
    expect(body.by_direction.alcista).toMatchObject({ n: 1, hits: 1 });
    expect(body.by_direction.neutral.n).toBe(0);
    // El enum DB confidence_t no tiene 'muy_alta' — el bucket muerto no se emite.
    expect(body.by_confidence).not.toHaveProperty('muy_alta');
  });

  it('autenticado pero NO en allowlist → 403 y NO toca los datos (llamada directa bloqueada)', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: { id: 'u1' }, authorized: false }) as never
    );
    const res = await GET();
    expect(res.status).toBe(403);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('no autenticado → 401 y NO toca los datos', async () => {
    vi.mocked(createSupabaseServer).mockResolvedValue(
      serverClient({ user: null, authorized: true }) as never
    );
    const res = await GET();
    expect(res.status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
});

// ── R9 · tasa base + n por cluster ──────────────────────────────────────────

/** A3 sin ATR usable → el umbral cae al piso 2% (mismo fallback que el cron). */
const A3_NO_ATR = { ...A3_BUY, operativa: { ...A3_BUY.operativa, atr_actual: null } };

function authorize() {
  vi.mocked(createSupabaseServer).mockResolvedValue(
    serverClient({ user: { id: 'u1' }, authorized: true }) as never
  );
}
function feed(rows: unknown[]) {
  const builder = makeBuilder({ then: { data: rows, error: null } });
  vi.mocked(createSupabaseAdmin).mockReturnValue({ from: vi.fn(() => builder) } as never);
}

describe('GET /api/metrics/calibration · base_rates (R9)', () => {
  // 6 filas a 30d, 2 tickers, umbral 2% (sin ATR) — mismo criterio que scoreSignal:
  //   AAPL +5, +3, −4  ·  BTC +6, +8, −1
  //   siempre alcista (r ≥ +2): +5 +3 +6 +8 → 4/6
  //   siempre neutral (|r| < 2): −1 → 1/6
  //   siempre bajista (r ≤ −2): −4 → 1/6
  const rows = [
    ['AAPL', 5, true],
    ['AAPL', 3, true],
    ['AAPL', -4, false],
    ['BTC-USD', 6, false],
    ['BTC-USD', 8, true],
    ['BTC-USD', -1, false],
  ].map(([ticker, ret, hit], i) =>
    outcomeRow(
      { analysis_id: `an-${i}`, horizon_days: 30, return_pct: ret, hit },
      { ticker, created_at: `2026-06-${String(10 + i * 5).padStart(2, '0')}T21:00:00Z`, a3_output: A3_NO_ATR }
    )
  );

  it('"siempre alcista" 4/6 · neutral 1/6 · bajista 1/6 a 30d, con el mismo umbral max(2%, k·ATR%)', async () => {
    authorize();
    feed(rows);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    const g30 = body.base_rates.global['30'];
    expect(g30.alcista).toMatchObject({ n: 6, hits: 4, hit_rate_pct: 66.7 });
    expect(g30.neutral).toMatchObject({ n: 6, hits: 1, hit_rate_pct: 16.7 });
    expect(g30.bajista).toMatchObject({ n: 6, hits: 1, hit_rate_pct: 16.7 });
    // ADAM sobre las MISMAS filas (3/6) — el comparador honesto va al lado.
    expect(g30.adam).toMatchObject({ n: 6, hits: 3, hit_rate_pct: 50 });
    // Ninguna fila a 7d → buckets vacíos, no NaN.
    expect(body.base_rates.global['7'].alcista).toMatchObject({ n: 0, hit_rate_pct: null });
    expect(body.base_rates.excluded_no_initial_price).toBe(0);
    // El umbral queda documentado en la respuesta.
    expect(body.base_rates.threshold).toMatchObject({ floor_pct: 2, atr_k: 1, no_atr_fallback_pct: 2 });
  });

  it('por ticker: AAPL alcista 2/3 · BTC alcista 2/3', async () => {
    authorize();
    feed(rows);
    const body = await (await GET()).json();
    expect(body.base_rates.by_ticker['AAPL']['30'].alcista).toMatchObject({ n: 3, hits: 2 });
    expect(body.base_rates.by_ticker['BTC-USD']['30'].alcista).toMatchObject({ n: 3, hits: 2 });
    expect(body.base_rates.by_ticker['AAPL']['30'].bajista).toMatchObject({ n: 3, hits: 1 });
    expect(body.base_rates.by_ticker['BTC-USD']['30'].neutral).toMatchObject({ n: 3, hits: 1 });
  });

  it('con ATR en la fila el umbral sube (ATR 5% → +3% ya NO es hit alcista)', async () => {
    authorize();
    // atr_actual 5 sobre initial 100 → ATR% 5 → umbral max(2, 5) = 5.
    feed([
      outcomeRow(
        { horizon_days: 30, return_pct: 3, hit: false },
        { a3_output: { ...A3_BUY, operativa: { ...A3_BUY.operativa, atr_actual: 5 } } }
      ),
    ]);
    const body = await (await GET()).json();
    expect(body.base_rates.global['30'].alcista).toMatchObject({ n: 1, hits: 0 });
    expect(body.base_rates.global['30'].neutral).toMatchObject({ n: 1, hits: 1 });
  });

  it('fila sin initial_price → excluida de la tasa base y contada por honestidad', async () => {
    authorize();
    feed([outcomeRow({ horizon_days: 30 }, { initial_price: null })]);
    const body = await (await GET()).json();
    expect(body.base_rates.global['30'].alcista.n).toBe(0);
    expect(body.base_rates.excluded_no_initial_price).toBe(1);
    // La tasa por fila (total) sigue contando la fila: solo la tasa base la excluye.
    expect(body.total.n).toBe(1);
  });
});

describe('GET /api/metrics/calibration · n_clusters (R9)', () => {
  it('5 filas del mismo ticker en días 1,2,3,10,11 → 2 clusters; el cluster acierta por su fila más antigua', async () => {
    authorize();
    const days = [1, 2, 3, 10, 11];
    // Cluster A (días 1,2,3): la más antigua (día 1) FALLA aunque 2 y 3 acierten.
    // Cluster B (días 10,11): la más antigua (día 10) ACIERTA.
    const hits = [false, true, true, true, false];
    feed(
      days.map((d, i) =>
        outcomeRow(
          { analysis_id: `an-${d}`, horizon_days: 7, hit: hits[i] },
          { ticker: 'SPY', created_at: new Date(Date.UTC(2026, 5, d, 21)).toISOString() }
        )
      )
    );
    const body = await (await GET()).json();
    expect(body.n_clusters.gap_days).toBe(3);
    // Por fila: 3/5. Por cluster: 1/2. La diferencia es exactamente lo que R9 quiere exponer.
    expect(body.by_horizon['7']).toMatchObject({ n: 5, hits: 3 });
    expect(body.n_clusters.by_horizon['7']).toMatchObject({ n: 2, hits: 1, hit_rate_pct: 50, rows: 5 });
    expect(body.n_clusters.by_horizon['30']).toMatchObject({ n: 0, hits: 0, hit_rate_pct: null, rows: 0 });
  });

  it('tickers distintos el mismo día NO colapsan; horizontes se clusterizan por separado', async () => {
    authorize();
    const at = '2026-06-01T21:00:00Z';
    feed([
      outcomeRow({ analysis_id: 'a', horizon_days: 7 }, { ticker: 'SPY', created_at: at }),
      outcomeRow({ analysis_id: 'b', horizon_days: 7 }, { ticker: 'QQQ', created_at: at }),
      outcomeRow({ analysis_id: 'a', horizon_days: 30 }, { ticker: 'SPY', created_at: at }),
    ]);
    const body = await (await GET()).json();
    expect(body.n_clusters.by_horizon['7']).toMatchObject({ n: 2, rows: 2 });
    expect(body.n_clusters.by_horizon['30']).toMatchObject({ n: 1, rows: 1 });
  });

  it('sin filas → clusters vacíos y base_rates vacías (sin NaN)', async () => {
    authorize();
    feed([]);
    const body = await (await GET()).json();
    expect(body.n_clusters.by_horizon['7']).toMatchObject({ n: 0, hit_rate_pct: null });
    expect(body.base_rates.global['30'].adam).toMatchObject({ n: 0, hit_rate_pct: null });
    expect(body.base_rates.by_ticker).toEqual({});
  });
});
