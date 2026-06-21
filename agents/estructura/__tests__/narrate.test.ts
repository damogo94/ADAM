import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock SOLO runAgent (no llamadas reales al LLM); MODELS y demás reales.
vi.mock('@/lib/anthropic', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/anthropic')>();
  return { ...actual, runAgent: vi.fn() };
});

import { runAgent } from '@/lib/anthropic';
import { narrateEstructura, synthesizeFallbackNarrative } from '../narrate';
import { computeEstructura } from '../compute';
import { ALCISTA_EN_ZONA } from './fixtures';

const mockRunAgent = vi.mocked(runAgent);

describe('narrateEstructura — compute determinista + narración LLM', () => {
  beforeEach(() => mockRunAgent.mockReset());

  it('mergea la narrativa del LLM con el compute intacto', async () => {
    mockRunAgent.mockResolvedValue({ narrative: 'Narrativa de prueba sobre la estructura.' });
    const out = await narrateEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    expect(out.narrative).toContain('Narrativa de prueba');
    expect(out.contexto.daily.direccion).toBe('alcista'); // compute no se toca
    expect(out.disclaimer).toContain('Análisis educativo');
    expect(mockRunAgent).toHaveBeenCalledOnce();
  });

  it('el fallback determinista respeta el contrato (≥20 chars, menciona ticker)', () => {
    const compute = computeEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA });
    const fallback = synthesizeFallbackNarrative(compute);
    expect(fallback.length).toBeGreaterThanOrEqual(20);
    expect(fallback.length).toBeLessThanOrEqual(2500);
    expect(fallback).toContain('TEST');
    expect(fallback).toMatch(/alcista/);
  });

  it('aísla: rechaza claves prohibidas antes de tocar el LLM', async () => {
    await expect(
      // @ts-expect-error — campo prohibido a propósito
      narrateEstructura({ ticker: 'TEST', ohlcv: ALCISTA_EN_ZONA, news: ['x'] })
    ).rejects.toThrow(/isolation/i);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});
