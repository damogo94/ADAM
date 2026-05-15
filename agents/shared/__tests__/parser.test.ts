/**
 * Tests para agents/shared/parser.ts
 *
 * Cubre:
 *   - extractJson: fenced cerrado, fenced abierto, plain JSON
 *   - parseAgentOutput: ok path, json_parse_error, schema_mismatch, empty_input
 *   - parseAgentOutputOrThrow: tira AgentParseError con metadata útil
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  extractJson,
  parseAgentOutput,
  parseAgentOutputOrThrow,
  AgentParseError,
} from '../parser';

const TestSchema = z.object({
  ticker: z.string(),
  confidence: z.number().int().min(0).max(100),
}).strict();

describe('extractJson', () => {
  it('extrae bloque ```json...``` cerrado', () => {
    const text = 'Aquí tienes: ```json\n{"a":1}\n``` listo.';
    expect(extractJson(text)).toBe('{"a":1}');
  });

  it('extrae bloque ```...``` sin "json"', () => {
    const text = 'algo ```\n{"a":1}\n```';
    expect(extractJson(text)).toBe('{"a":1}');
  });

  it('strips opener sin cierre (max_tokens cut)', () => {
    const text = '```json\n{"a":1, "b":2';
    expect(extractJson(text)).toBe('{"a":1, "b":2');
  });

  it('devuelve trim si no hay fences', () => {
    const text = '  \n{"a":1}\n  ';
    expect(extractJson(text)).toBe('{"a":1}');
  });
});

describe('parseAgentOutput — happy path', () => {
  it('parsea raw plano correctamente', () => {
    const result = parseAgentOutput(TestSchema, '{"ticker":"AAPL","confidence":75}', {
      agentName: 'TEST',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ticker).toBe('AAPL');
      expect(result.data.confidence).toBe(75);
    }
  });

  it('parsea raw con fence ```json', () => {
    const raw = '```json\n{"ticker":"BTC-USD","confidence":50}\n```';
    const result = parseAgentOutput(TestSchema, raw, { agentName: 'TEST' });
    expect(result.ok).toBe(true);
  });
});

describe('parseAgentOutput — error paths', () => {
  it('empty_input cuando raw está vacío', () => {
    const result = parseAgentOutput(TestSchema, '', { agentName: 'TEST' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe('empty_input');
    }
  });

  it('empty_input cuando raw solo whitespace', () => {
    const result = parseAgentOutput(TestSchema, '   \n  ', { agentName: 'TEST' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe('empty_input');
    }
  });

  it('json_parse_error cuando el texto NO es JSON', () => {
    const result = parseAgentOutput(TestSchema, 'no soy JSON, lo siento', {
      agentName: 'TEST',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe('json_parse_error');
      expect(result.rawPreview).toBeDefined();
      expect(result.rawPreview!.length).toBeLessThanOrEqual(500);
    }
  });

  it('schema_mismatch cuando JSON parsea pero campos no cuadran', () => {
    const raw = '{"ticker":"AAPL","confidence":150}'; // confidence > 100
    const result = parseAgentOutput(TestSchema, raw, { agentName: 'TEST' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe('schema_mismatch');
      expect(result.issues).toBeDefined();
      expect(result.issues!.length).toBeGreaterThan(0);
      expect(result.issues![0]).toMatch(/confidence/);
    }
  });

  it('schema_mismatch reporta primeros 5 issues como máximo', () => {
    // Un objeto que falla múltiples campos
    const raw = '{"ticker":123,"confidence":"high","extra":1}';
    const result = parseAgentOutput(TestSchema, raw, { agentName: 'TEST' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues!.length).toBeLessThanOrEqual(5);
    }
  });

  it('rawPreview trunca a 500 chars y reemplaza newlines', () => {
    const raw = 'a'.repeat(800) + '\nmás';
    const result = parseAgentOutput(TestSchema, raw, { agentName: 'TEST' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rawPreview!.length).toBeLessThanOrEqual(500);
      expect(result.rawPreview!.includes('\n')).toBe(false);
    }
  });
});

describe('parseAgentOutputOrThrow', () => {
  it('devuelve data en happy path', () => {
    const data = parseAgentOutputOrThrow(
      TestSchema,
      '{"ticker":"AAPL","confidence":50}',
      { agentName: 'TEST' }
    );
    expect(data.ticker).toBe('AAPL');
  });

  it('tira AgentParseError con metadata estructurada', () => {
    try {
      parseAgentOutputOrThrow(TestSchema, '{"broken":true}', { agentName: 'TEST' });
      expect.fail('debería haber tirado');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentParseError);
      const aerr = err as AgentParseError;
      expect(aerr.agentName).toBe('TEST');
      expect(aerr.errorKind).toBe('schema_mismatch');
      expect(aerr.issues).toBeDefined();
    }
  });

  it('AgentParseError preserva errorKind="json_parse_error" para raw no-JSON', () => {
    try {
      parseAgentOutputOrThrow(TestSchema, 'plain text', { agentName: 'TEST' });
      expect.fail('debería haber tirado');
    } catch (err) {
      const aerr = err as AgentParseError;
      expect(aerr.errorKind).toBe('json_parse_error');
    }
  });
});
