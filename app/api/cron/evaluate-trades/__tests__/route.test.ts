/**
 * Tests del cron /api/cron/evaluate-trades (ADR-002 fase 3 · F7 multi-fuente).
 *
 * Mockea Supabase admin (harness de rutas) y fallbackDaily; deja correr
 * evaluateTrade() de verdad (es puro) — así el test cubre el pegamento
 * cron↔motor con velas sintéticas controladas.
 *
 * El route consulta `analyses_log` DOS veces (grupo A3 + grupo Estructura) y las
 * fusiona por id; el mock de `from('analyses_log')` sirve un builder por llamada
 * desde una cola, así cada grupo devuelve su propio conjunto de candidatos.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeRequest, makeBuilder, makeSupabaseMock, type QueryBuilderMock } from '@/test/helpers/route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/market/finnhub', () => ({ fallbackDaily: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { GET } from '../route';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { fallbackDaily } from '@/lib/market/finnhub';

const DAY_MS = 86_400_000;
const SECRET = 'test-secret';

// Ancla temporal: análisis hecho hace 60 días → ventana swing (30d) ya vencida.
const START_MS = Date.now() - 60 * DAY_MS;
const START_ISO = new Date(START_MS).toISOString();

/** Vela diaria sintética; t en segundos, `daysAfter` desde el análisis. */
function candle(daysAfter: number, h: number, l: number, c = (h + l) / 2) {
  return { t: Math.floor((START_MS + daysAfter * DAY_MS) / 1000), o: c, h, l, c, v: 0 };
}

function buyPlan(over: Record<string, unknown> = {}) {
  return {
    operativa: {
      signal: 'buy',
      entry_type: 'market',
      entrada: 100,
      stop_loss: 95,
      target: 110,
      atr_actual: 2,
      ratio_riesgo_beneficio: 2,
      horizonte: 'swing',
      ...over,
    },
  };
}

/**
 * estructura_output accionable (setup listo + geometría de compra swing). El
 * horizonte swing sale de `timeframe_entrada: '1D'` (horizonteFromEstructuraTimeframe).
 */
function estructuraBuy(over: {
  estado?: string;
  direccion?: string;
  timeframe_entrada?: string;
  entrada?: number;
  stop_loss?: number;
  take_profit?: number;
  entry_type?: string | null;
  ratio_riesgo_beneficio?: number | null;
} = {}) {
  return {
    setup: {
      direccion: over.direccion ?? 'compra',
      timeframe_entrada: over.timeframe_entrada ?? '1D',
      estado: over.estado ?? 'listo',
    },
    gestion: {
      entrada: over.entrada ?? 100,
      entry_type: over.entry_type === undefined ? 'market' : over.entry_type,
      stop_loss: over.stop_loss ?? 95,
      take_profit: over.take_profit ?? 110,
      ratio_riesgo_beneficio: over.ratio_riesgo_beneficio === undefined ? 2 : over.ratio_riesgo_beneficio,
    },
  };
}

function req(headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }) {
  return makeRequest('http://localhost/api/cron/evaluate-trades', { method: 'GET', headers });
}

/**
 * Monta el admin mock. `from('analyses_log')` sirve builders desde una cola:
 * 1ª llamada = grupo A3, 2ª = grupo Estructura. `from('trade_outcomes')` reusa
 * un único builder (el done-set y el insert comparten tabla).
 */
function mountAdmin(opts: {
  a3Candidates?: unknown[];
  estructuraCandidates?: unknown[];
  existing?: { analysis_id: string; source: string }[];
}): { a3: QueryBuilderMock; estructura: QueryBuilderMock; trades: QueryBuilderMock } {
  const a3 = makeBuilder({ then: { data: opts.a3Candidates ?? [], error: null } });
  const estructura = makeBuilder({ then: { data: opts.estructuraCandidates ?? [], error: null } });
  const trades = makeBuilder({ then: { data: opts.existing ?? [], error: null } });

  const analysesQueue = [a3, estructura];
  const from = vi.fn((table: string) => {
    if (table === 'analyses_log') return analysesQueue.shift() ?? makeBuilder();
    if (table === 'trade_outcomes') return trades;
    return makeBuilder();
  });
  const client = { auth: { getUser: vi.fn() }, from };
  vi.mocked(createSupabaseAdmin).mockReturnValue(client as never);
  return { a3, estructura, trades };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('evaluate-trades · auth', () => {
  it('500 si no hay CRON_SECRET', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('401 con Bearer incorrecto', async () => {
    const res = await GET(req({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });
});

describe('evaluate-trades · resolución A3', () => {
  it('persiste un win cuando el precio toca el target (source a3)', async () => {
    const { trades } = mountAdmin({
      a3Candidates: [
        { id: 'an-1', ticker: 'AAPL', initial_price_at: START_ISO, a3_output: buyPlan(), estructura_output: null },
      ],
    });
    vi.mocked(fallbackDaily).mockResolvedValue([
      candle(1, 101, 99),
      candle(2, 112, 108, 110), // toca target 110 → win
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resolved_count).toBe(1);
    expect(trades.insert).toHaveBeenCalledTimes(1);
    expect(trades.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis_id: 'an-1',
        source: 'a3',
        direction: 'buy',
        entry_type: 'market',
        horizonte: 'swing',
        outcome: 'win',
        entry: 100,
        target: 110,
        exit_price: 110,
        rb_ratio: 2,
      })
    );
  });

  it('persiste un loss cuando el precio toca el stop primero', async () => {
    const { trades } = mountAdmin({
      a3Candidates: [
        { id: 'an-2', ticker: 'AAPL', initial_price_at: START_ISO, a3_output: buyPlan(), estructura_output: null },
      ],
    });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 101, 99), candle(2, 99, 94, 95)]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(1);
    expect(trades.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'a3', outcome: 'loss', exit_price: 95, r_multiple: -1 })
    );
  });
});

describe('evaluate-trades · Estructura (F7)', () => {
  it('A3=hold pero Estructura accionable → inserta una fila source=estructura', async () => {
    const { trades } = mountAdmin({
      // El análisis NO es accionable por A3 (hold) → no aparece en el grupo A3.
      // SÍ es accionable por Estructura → aparece solo en el grupo Estructura.
      estructuraCandidates: [
        {
          id: 'an-e',
          ticker: 'AAPL',
          initial_price_at: START_ISO,
          a3_output: { operativa: { signal: 'hold', entrada: null, stop_loss: null, target: null, horizonte: 'swing' } },
          estructura_output: estructuraBuy(),
        },
      ],
    });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 101, 99), candle(2, 112, 108, 110)]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resolved_count).toBe(1);
    expect(trades.insert).toHaveBeenCalledTimes(1);
    expect(trades.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis_id: 'an-e',
        source: 'estructura',
        direction: 'buy',
        entry_type: 'market',
        horizonte: 'swing',
        outcome: 'win',
        entry: 100,
        stop_loss: 95,
        target: 110,
        rb_ratio: 2,
      })
    );
  });

  it('análisis con A3 Y Estructura accionables → dos filas (a3 y estructura)', async () => {
    // Mismo análisis en ambos grupos → se fusiona por id en un único candidato
    // con a3_output + estructura_output; cada fuente se evalúa e inserta aparte.
    const row = {
      id: 'an-both',
      ticker: 'AAPL',
      initial_price_at: START_ISO,
      a3_output: buyPlan(),
      estructura_output: estructuraBuy(),
    };
    const { trades } = mountAdmin({ a3Candidates: [row], estructuraCandidates: [row] });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 101, 99), candle(2, 112, 108, 110)]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(2);
    expect(trades.insert).toHaveBeenCalledTimes(2);
    const sources = trades.insert.mock.calls.map((call) => (call[0] as { source: string }).source);
    expect(sources).toEqual(expect.arrayContaining(['a3', 'estructura']));
    // Velas cacheadas por ticker → un solo fetch aunque haya 2 fuentes.
    expect(fallbackDaily).toHaveBeenCalledTimes(1);
  });

  it('done-set respeta la clave compuesta (analysis_id, source)', async () => {
    // Ya existe la fila a3; solo debe insertarse la de Estructura.
    const row = {
      id: 'an-both',
      ticker: 'AAPL',
      initial_price_at: START_ISO,
      a3_output: buyPlan(),
      estructura_output: estructuraBuy(),
    };
    const { trades } = mountAdmin({
      a3Candidates: [row],
      estructuraCandidates: [row],
      existing: [{ analysis_id: 'an-both', source: 'a3' }],
    });
    vi.mocked(fallbackDaily).mockResolvedValue([candle(1, 101, 99), candle(2, 112, 108, 110)]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(1);
    expect(trades.insert).toHaveBeenCalledTimes(1);
    expect(trades.insert).toHaveBeenCalledWith(expect.objectContaining({ source: 'estructura' }));
  });

  it('salta Estructura intradía (timeframe_entrada 4H → intradía, fase 4)', async () => {
    const { trades } = mountAdmin({
      estructuraCandidates: [
        {
          id: 'an-intra',
          ticker: 'AAPL',
          initial_price_at: START_ISO,
          a3_output: null,
          estructura_output: estructuraBuy({ timeframe_entrada: '4H' }),
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
    expect(fallbackDaily).not.toHaveBeenCalled();
  });

  it('salta Estructura no accionable (estado esperando_zona)', async () => {
    const { trades } = mountAdmin({
      // esperando_zona no está en ESTRUCTURA_ESTADOS_ACCIONABLES → el filtro server
      // no lo traería; aquí lo forzamos en memoria para probar la revalidación.
      estructuraCandidates: [
        {
          id: 'an-nz',
          ticker: 'AAPL',
          initial_price_at: START_ISO,
          a3_output: null,
          estructura_output: estructuraBuy({ estado: 'esperando_zona' }),
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
  });
});

describe('evaluate-trades · escalabilidad', () => {
  it('filtra accionables EN LA QUERY (jsonb path) — A3 y Estructura por separado', async () => {
    const { a3, estructura } = mountAdmin({});
    await GET(req());
    // Grupo A3: signal + horizonte accionables.
    expect(a3.in).toHaveBeenCalledWith('a3_output->operativa->>signal', ['buy', 'sell']);
    expect(a3.in).toHaveBeenCalledWith('a3_output->operativa->>horizonte', ['swing', 'posicional']);
    // Grupo Estructura: setup.estado accionable.
    expect(estructura.in).toHaveBeenCalledWith('estructura_output->setup->>estado', [
      'listo',
      'esperando_confirmacion',
    ]);
  });
});

describe('evaluate-trades · descartes', () => {
  it('salta análisis hold (no es un trade) — sin insert', async () => {
    const { trades } = mountAdmin({
      a3Candidates: [
        {
          id: 'hold-1',
          ticker: 'AAPL',
          initial_price_at: START_ISO,
          a3_output: { operativa: { signal: 'hold', entrada: null, stop_loss: null, target: null, horizonte: 'swing' } },
          estructura_output: null,
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();

    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
    expect(fallbackDaily).not.toHaveBeenCalled();
  });

  it('salta intradía A3 (se evalúa con 4H en fase 4)', async () => {
    const { trades } = mountAdmin({
      a3Candidates: [
        {
          id: 'intra-1',
          ticker: 'AAPL',
          initial_price_at: START_ISO,
          a3_output: buyPlan({ horizonte: 'intradia' }),
          estructura_output: null,
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
  });

  it('no re-evalúa un análisis A3 ya presente en trade_outcomes', async () => {
    const { trades } = mountAdmin({
      a3Candidates: [
        { id: 'an-done', ticker: 'AAPL', initial_price_at: START_ISO, a3_output: buyPlan(), estructura_output: null },
      ],
      existing: [{ analysis_id: 'an-done', source: 'a3' }],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
  });

  it('cuenta como pending (sin persistir) si no hay barrera y la ventana no venció', async () => {
    const recentMs = Date.now() - 3 * DAY_MS; // ventana swing 30d NO vencida
    const recentISO = new Date(recentMs).toISOString();
    const { trades } = mountAdmin({
      a3Candidates: [
        { id: 'an-pend', ticker: 'AAPL', initial_price_at: recentISO, a3_output: buyPlan(), estructura_output: null },
      ],
    });
    // velas dentro de ventana, sin tocar stop ni target
    vi.mocked(fallbackDaily).mockResolvedValue([
      { t: Math.floor((recentMs + DAY_MS) / 1000), o: 100, h: 101, l: 99, c: 100, v: 0 },
      { t: Math.floor((recentMs + 2 * DAY_MS) / 1000), o: 100, h: 102, l: 98, c: 100, v: 0 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.pending_count).toBe(1);
    expect(body.resolved_count).toBe(0);
    expect(trades.insert).not.toHaveBeenCalled();
  });
});
