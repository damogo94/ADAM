/**
 * Tests para lib/anthropic.ts — runWithParseRetry
 *
 * Refactor Fase 2 · Tarea 2.2
 *
 * Verifica el comportamiento del retry de parsing/schema:
 *   - JSON malformado primer intento → retry → segundo intento OK → success
 *   - Schema mismatch primer intento → retry → segundo OK → success
 *   - Ambos intentos fallan → AgentParseError tipado
 *   - Primer intento OK → NO retry (1 sola llamada)
 *   - El tracking onUsage solo se llama tras éxito
 *
 * Estrategia: callOnce es una función inyectada — fácil de mockear. NO
 * tocamos el SDK real ni red.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { runWithParseRetry, AgentParseError, type AgentUsage } from '@/lib/anthropic';

// ───────────────────────────────────────────────────────────────────────────
// Helpers para crear Anthropic.Message mocks
// ───────────────────────────────────────────────────────────────────────────

function mkMessage(textContent: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  return {
    id: 'msg_test',
    type: 'message' as const,
    role: 'assistant' as const,
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text' as const, text: textContent, citations: null }],
    stop_reason: 'end_turn' as const,
    stop_sequence: null,
    usage,
  };
}

const TestSchema = z
  .object({
    ticker: z.string(),
    score: z.number().int().min(0).max(100),
  })
  .strict();

// ───────────────────────────────────────────────────────────────────────────
// Happy path
// ───────────────────────────────────────────────────────────────────────────

describe('runWithParseRetry — éxito al primer intento', () => {
  it('un solo callOnce + devuelve data parseada', async () => {
    const callOnce = vi.fn(async () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mkMessage('{"ticker":"AAPL","score":75}') as any
    );

    const data = await runWithParseRetry({
      agentName: 'TEST',
      schema: TestSchema,
      callOnce,
    });

    expect(callOnce).toHaveBeenCalledOnce();
    expect(data.ticker).toBe('AAPL');
    expect(data.score).toBe(75);
  });

  it('onUsage se invoca con los tokens reales', async () => {
    const callOnce = vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async () => mkMessage('{"ticker":"AAPL","score":75}', { input_tokens: 234, output_tokens: 56 }) as any
    );
    const usages: AgentUsage[] = [];

    await runWithParseRetry({
      agentName: 'TEST',
      schema: TestSchema,
      callOnce,
      onUsage: (u) => usages.push(u),
    });

    expect(usages).toHaveLength(1);
    expect(usages[0]!.input_tokens).toBe(234);
    expect(usages[0]!.output_tokens).toBe(56);
    expect(usages[0]!.agent).toBe('TEST');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Retry path
// ───────────────────────────────────────────────────────────────────────────

describe('runWithParseRetry — JSON malformado en 1er intento', () => {
  it('retry y devuelve data del 2º intento si éste es válido', async () => {
    const callOnce = vi
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('esto no es JSON, lo siento') as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('{"ticker":"AAPL","score":80}') as any);

    const data = await runWithParseRetry({
      agentName: 'TEST',
      schema: TestSchema,
      callOnce,
    });

    expect(callOnce).toHaveBeenCalledTimes(2);
    expect(data.score).toBe(80);
  });

  it('los dos intentos JSON-malformados → AgentParseError', async () => {
    const callOnce = vi
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('no JSON intento 1') as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('no JSON intento 2') as any);

    await expect(
      runWithParseRetry({ agentName: 'TEST', schema: TestSchema, callOnce })
    ).rejects.toThrow(AgentParseError);
    expect(callOnce).toHaveBeenCalledTimes(2);
  });

  it('onUsage NO se invoca si el flow termina en error', async () => {
    const callOnce = vi
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue(mkMessage('not json') as any);
    const usages: AgentUsage[] = [];

    await expect(
      runWithParseRetry({
        agentName: 'TEST',
        schema: TestSchema,
        callOnce,
        onUsage: (u) => usages.push(u),
      })
    ).rejects.toThrow(AgentParseError);

    expect(usages).toHaveLength(0);
  });
});

describe('runWithParseRetry — schema mismatch en 1er intento', () => {
  it('retry y devuelve data del 2º intento si éste es válido', async () => {
    const callOnce = vi
      .fn()
      // 1er intento: JSON válido pero score fuera de rango
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('{"ticker":"AAPL","score":150}') as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('{"ticker":"AAPL","score":90}') as any);

    const data = await runWithParseRetry({
      agentName: 'TEST',
      schema: TestSchema,
      callOnce,
    });

    expect(callOnce).toHaveBeenCalledTimes(2);
    expect(data.score).toBe(90);
  });

  it('schema mismatch en ambos intentos → AgentParseError con zodIssues', async () => {
    const callOnce = vi
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('{"ticker":"AAPL","score":150}') as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('{"ticker":"AAPL","score":-5}') as any);

    try {
      await runWithParseRetry({ agentName: 'TEST', schema: TestSchema, callOnce });
      expect.fail('debería haber tirado');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentParseError);
      const aerr = err as AgentParseError;
      expect(aerr.agent).toBe('TEST');
      expect(aerr.zodIssues.length).toBeGreaterThan(0);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Mixed scenarios
// ───────────────────────────────────────────────────────────────────────────

describe('runWithParseRetry — escenarios mixtos', () => {
  it('JSON-malformed primero, schema-mismatch segundo → throw', async () => {
    const callOnce = vi
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('not json') as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(mkMessage('{"score":999}') as any);

    await expect(
      runWithParseRetry({ agentName: 'TEST', schema: TestSchema, callOnce })
    ).rejects.toThrow(AgentParseError);
    expect(callOnce).toHaveBeenCalledTimes(2);
  });

  it('fence ```json``` se strip-ea correctamente y parsea', async () => {
    const callOnce = vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async () => mkMessage('```json\n{"ticker":"BTC-USD","score":50}\n```') as any
    );

    const data = await runWithParseRetry({
      agentName: 'TEST',
      schema: TestSchema,
      callOnce,
    });
    expect(callOnce).toHaveBeenCalledOnce();
    expect(data.ticker).toBe('BTC-USD');
  });

  it('si callOnce throws (error de red), el error se propaga (no retry interno)', async () => {
    const callOnce = vi.fn(async () => {
      throw new Error('Anthropic 429');
    });

    await expect(
      runWithParseRetry({ agentName: 'TEST', schema: TestSchema, callOnce })
    ).rejects.toThrow('Anthropic 429');
    // Solo 1 intento — los errores de red los maneja el SDK con sus propios retries
    expect(callOnce).toHaveBeenCalledOnce();
  });
});
