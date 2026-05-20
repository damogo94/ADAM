import { describe, it, expect } from 'vitest';
import {
  costOf,
  aggregateByAgent,
  summarize,
  pricingFor,
  type UsageRow,
} from '../cost';

describe('pricingFor', () => {
  it('Sonnet 4.6 tarifa correcta', () => {
    expect(pricingFor('claude-sonnet-4-6')).toEqual({
      input_usd_per_mtok: 3.0,
      output_usd_per_mtok: 15.0,
    });
  });

  it('Opus 4.6 tarifa correcta', () => {
    expect(pricingFor('claude-opus-4-6')).toEqual({
      input_usd_per_mtok: 15.0,
      output_usd_per_mtok: 75.0,
    });
  });

  it('Haiku con sufijo de fecha resuelve correctamente', () => {
    expect(pricingFor('claude-haiku-4-5-20251001').input_usd_per_mtok).toBe(0.8);
  });

  it('Modelo desconocido cae al fallback Sonnet', () => {
    expect(pricingFor('claude-unknown-9-9')).toEqual({
      input_usd_per_mtok: 3.0,
      output_usd_per_mtok: 15.0,
    });
  });
});

describe('costOf', () => {
  it('cálculo básico sin cache', () => {
    const u: UsageRow = {
      agent: 'A1',
      model: 'claude-sonnet-4-6',
      input_tokens: 1_000_000,
      output_tokens: 500_000,
    };
    const c = costOf(u);
    // 1M input × $3 = $3; 0.5M output × $15 = $7.5
    expect(c.input_usd).toBeCloseTo(3);
    expect(c.output_usd).toBeCloseTo(7.5);
    expect(c.total_usd).toBeCloseTo(10.5);
  });

  it('cache_read aplica 10% del precio input', () => {
    const u: UsageRow = {
      agent: 'A1',
      model: 'claude-sonnet-4-6',
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    };
    // 1M × $3 × 0.10 = $0.30
    expect(costOf(u).cache_read_usd).toBeCloseTo(0.3);
  });

  it('cache_creation aplica 125% del precio input', () => {
    const u: UsageRow = {
      agent: 'A1',
      model: 'claude-sonnet-4-6',
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    };
    // 1M × $3 × 1.25 = $3.75
    expect(costOf(u).cache_creation_usd).toBeCloseTo(3.75);
  });

  it('Opus es ~5× más caro que Sonnet en mismo uso', () => {
    const u: UsageRow = {
      agent: 'DEBATE',
      model: 'claude-opus-4-6',
      input_tokens: 100_000,
      output_tokens: 50_000,
    };
    const c = costOf(u);
    // 100k × $15/M = $1.5 input; 50k × $75/M = $3.75 output → $5.25
    expect(c.total_usd).toBeCloseTo(5.25);
  });
});

describe('aggregateByAgent', () => {
  it('agrupa varias llamadas del mismo agente', () => {
    const usages: UsageRow[] = [
      { agent: 'A1', model: 'claude-sonnet-4-6', input_tokens: 1000, output_tokens: 500 },
      { agent: 'A1', model: 'claude-sonnet-4-6', input_tokens: 2000, output_tokens: 1000 },
      { agent: 'A2', model: 'claude-sonnet-4-6', input_tokens: 3000, output_tokens: 1500 },
    ];
    const agg = aggregateByAgent(usages);
    expect(agg.get('A1')?.runs).toBe(2);
    expect(agg.get('A1')?.input_tokens).toBe(3000);
    expect(agg.get('A1')?.output_tokens).toBe(1500);
    expect(agg.get('A2')?.runs).toBe(1);
  });

  it('lista todos los modelos vistos', () => {
    const usages: UsageRow[] = [
      { agent: 'A4', model: 'claude-opus-4-6', input_tokens: 100, output_tokens: 50 },
      { agent: 'A4', model: 'claude-sonnet-4-6', input_tokens: 100, output_tokens: 50 },
    ];
    const a4 = aggregateByAgent(usages).get('A4');
    expect(a4?.models.sort()).toEqual(['claude-opus-4-6', 'claude-sonnet-4-6'].sort());
  });

  it('case-insensitive: A1 y a1 cuentan como mismo agente', () => {
    const usages: UsageRow[] = [
      { agent: 'A1', model: 'claude-sonnet-4-6', input_tokens: 100, output_tokens: 50 },
      { agent: 'a1', model: 'claude-sonnet-4-6', input_tokens: 100, output_tokens: 50 },
    ];
    expect(aggregateByAgent(usages).get('A1')?.runs).toBe(2);
  });

  it('cache_hit_rate_pct se calcula sobre input + cache_read', () => {
    const usages: UsageRow[] = [
      {
        agent: 'A1',
        model: 'claude-sonnet-4-6',
        input_tokens: 200,
        output_tokens: 100,
        cache_read_input_tokens: 800, // 80% cache hit sobre 1000 input billable
      },
    ];
    expect(aggregateByAgent(usages).get('A1')?.cache_hit_rate_pct).toBe(80);
  });

  it('cache_hit_rate_pct = 0 cuando no hay tokens', () => {
    const usages: UsageRow[] = [
      { agent: 'A1', model: 'claude-sonnet-4-6', input_tokens: 0, output_tokens: 0 },
    ];
    expect(aggregateByAgent(usages).get('A1')?.cache_hit_rate_pct).toBe(0);
  });
});

describe('summarize', () => {
  it('ordena por coste descendente', () => {
    const usages: UsageRow[] = [
      // A1 barato
      { agent: 'A1', model: 'claude-sonnet-4-6', input_tokens: 100, output_tokens: 50 },
      // DEBATE caro (Opus)
      { agent: 'DEBATE', model: 'claude-opus-4-6', input_tokens: 1000, output_tokens: 500 },
    ];
    const s = summarize(usages);
    expect(s.by_agent[0]?.agent).toBe('DEBATE');
    expect(s.by_agent[1]?.agent).toBe('A1');
  });

  it('total_cost_usd suma todos los agentes', () => {
    const usages: UsageRow[] = [
      { agent: 'A1', model: 'claude-sonnet-4-6', input_tokens: 1_000_000, output_tokens: 0 },
      { agent: 'A2', model: 'claude-sonnet-4-6', input_tokens: 1_000_000, output_tokens: 0 },
    ];
    // 2× ($3) = $6
    expect(summarize(usages).total_cost_usd).toBeCloseTo(6);
  });

  it('input vacío devuelve summary vacío sin crashear', () => {
    const s = summarize([]);
    expect(s.total_tokens).toBe(0);
    expect(s.total_cost_usd).toBe(0);
    expect(s.by_agent).toEqual([]);
  });
});
