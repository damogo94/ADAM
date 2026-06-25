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
