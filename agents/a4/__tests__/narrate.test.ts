/**
 * Tests de narrateA4 (Etapa 1 — sesgo direccional de A4).
 *
 * Mockea runAgent (LLM) y captura el userMessage para verificar que A4 RECIBE
 * la dirección de A2 (regime_outlook) — sin ella, A4 nunca veía el sesgo
 * alcista macro → "A4 nunca positivo" (0/209 en prod). También fija que el
 * system prompt trae la regla de dirección explícita y simétrica.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/anthropic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/anthropic')>();
  return { ...actual, runAgent: vi.fn() };
});

import { narrateA4 } from '../narrate';
import { A4_SYSTEM_PROMPT } from '../prompt';
import { runAgent } from '@/lib/anthropic';
import type { A2Output_t } from '@/agents/shared/types';

const CONFLUENCE = {
  a3_solo: { score: 0, nivel: 'baja' },
  a1_a2: { score: 0, nivel: 'baja' },
  alineados: { score: 0, nivel: 'baja' },
  score_total_pct: 0,
  nivel_final: 'baja',
} as never;

const A2_RISK_ON = {
  ticker: 'AAPL',
  regime_outlook: 'risk_on',
  opportunity_detected: true,
  opportunity_description: 'régimen macro favorable',
  confidence: 60,
  narrative: 'macro en risk-on, viento de cola.',
} as unknown as A2Output_t;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runAgent).mockResolvedValue({
    resumen_a1: 'a',
    resumen_a2: 'b',
    resumen_a3: 'c',
    direccion: 'neutral',
    confianza: 'baja',
    accion_sugerida: 'x',
    riesgo_clave: 'y',
  } as never);
});

describe('narrateA4 — A4 recibe la dirección de A2', () => {
  it('pasa regime_outlook de A2 al LLM (visible en el userMessage)', async () => {
    await narrateA4({ ticker: 'AAPL', a1: null, a2: A2_RISK_ON, a3: null, debate: null, confluence: CONFLUENCE });
    const call = vi.mocked(runAgent).mock.calls[0]![0];
    expect(call.userMessage).toContain('regime_outlook');
    expect(call.userMessage).toContain('risk_on');
  });
});

describe('A4_SYSTEM_PROMPT — regla de dirección', () => {
  it('trae la derivación de dirección explícita y simétrica', () => {
    expect(A4_SYSTEM_PROMPT).toContain('risk_on → alcista');
    expect(A4_SYSTEM_PROMPT).toMatch(/SIM[EÉ]TRIC/i);
  });

  it('ya no instruye a A4 a CALCULAR la confluencia (la recibe)', () => {
    expect(A4_SYSTEM_PROMPT).not.toContain('Calcular el INDICADOR DE CONFLUENCIA');
  });
});
