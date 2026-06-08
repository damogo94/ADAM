/**
 * Tests de computeDivergence — desacuerdo en DOS EJES separados.
 *
 * Verifica que A3 (aislado) se compara contra el consenso A1+A2 (no A4), que
 * los dos ejes no se funden, y que con agentes faltantes el eje afectado es
 * 'unavailable' (nunca "alineado").
 */

import { describe, it, expect } from 'vitest';
import { computeDivergence } from '../compute-divergence';

const base = {
  a1_output: { anomaly_detected: true, anomaly_type: 'oportunidad' }, // up
  a2_output: { regime_outlook: 'risk_on' }, // up
  a3_output: { tendencia: { primaria: 'alcista' } }, // up
  debate_output: { convergence_score: 70, direccion: 'alcista' },
};
const raw = (over: Record<string, unknown> = {}) => ({ ...base, ...over });

describe('computeDivergence · eje narrativo (A1↔A2)', () => {
  it('A1 alza + A2 alza → alineados', () => {
    const d = computeDivergence(raw());
    expect(d.narrative.state).toBe('aligned');
    expect(d.narrative.a1).toBe('up');
    expect(d.narrative.a2).toBe('up');
    expect(d.narrative.debate_convergence).toBe(70);
    expect(d.alive_count).toBe(3);
  });

  it('A1 alza + A2 risk_off → divergen', () => {
    const d = computeDivergence(raw({ a2_output: { regime_outlook: 'risk_off' } }));
    expect(d.narrative.state).toBe('divergent');
    expect(d.narrative.a1).toBe('up');
    expect(d.narrative.a2).toBe('down');
  });

  it('A1 alza + A2 neutral → mixto', () => {
    const d = computeDivergence(raw({ a2_output: { regime_outlook: 'neutral' } }));
    expect(d.narrative.state).toBe('mixed');
  });

  it('A2 sin regime_outlook → fallback a opportunity_detected', () => {
    const d = computeDivergence(raw({ a2_output: { opportunity_detected: true } }));
    expect(d.narrative.a2).toBe('up');
  });
});

describe('computeDivergence · eje técnico (A3 vs consenso A1+A2, NO A4)', () => {
  it('A3 alza con consenso narrativo alza → alineado', () => {
    const d = computeDivergence(raw());
    expect(d.technical.state).toBe('aligned');
    expect(d.technical.a3).toBe('up');
    expect(d.technical.narrative_consensus).toBe('up');
  });

  it('A3 baja con consenso narrativo alza → DIVERGENTE (la divergencia valiosa)', () => {
    const d = computeDivergence(raw({ a3_output: { tendencia: { primaria: 'bajista' } } }));
    expect(d.narrative.state).toBe('aligned'); // A1+A2 siguen alineados
    expect(d.technical.state).toBe('divergent'); // A3 contradice a la narrativa
    expect(d.technical.a3).toBe('down');
  });

  it('A3 lateral → neutro (sin (des)alineación marcada)', () => {
    const d = computeDivergence(raw({ a3_output: { tendencia: { primaria: 'lateral' } } }));
    expect(d.technical.state).toBe('neutral');
  });

  it('consenso ambiguo (A1↔A2 divergen) → técnico neutro (consenso flat)', () => {
    const d = computeDivergence(raw({ a2_output: { regime_outlook: 'risk_off' } }));
    expect(d.technical.narrative_consensus).toBe('flat');
    expect(d.technical.state).toBe('neutral');
  });

  it('A3 sin tendencia → fallback al signal operativo', () => {
    const d = computeDivergence(raw({ a3_output: { operativa: { signal: 'sell' } } }));
    expect(d.technical.a3).toBe('down');
  });
});

describe('computeDivergence · estados parciales (honestidad con 2 de 3)', () => {
  it('falta A2 → narrativa y técnico unavailable, alive_count 2', () => {
    const d = computeDivergence(raw({ a2_output: null }));
    expect(d.agents_alive.a2).toBe(false);
    expect(d.alive_count).toBe(2);
    expect(d.narrative.state).toBe('unavailable');
    expect(d.technical.state).toBe('unavailable'); // sin consenso narrativo
    expect(d.technical.narrative_consensus).toBeNull();
  });

  it('falta A3 → técnico unavailable, narrativa intacta', () => {
    const d = computeDivergence(raw({ a3_output: null }));
    expect(d.agents_alive.a3).toBe(false);
    expect(d.technical.state).toBe('unavailable');
    expect(d.narrative.state).toBe('aligned');
  });

  it('raw null/vacío → todo unavailable, alive_count 0', () => {
    const d = computeDivergence(null);
    expect(d.alive_count).toBe(0);
    expect(d.narrative.state).toBe('unavailable');
    expect(d.technical.state).toBe('unavailable');
    expect(d.narrative.debate_convergence).toBeNull();
  });
});
