import { describe, it, expect } from 'vitest';
import { applyRunEvent } from '../apply-event';
import { INITIAL, type RunState, type StreamEvent } from '../types';

/**
 * Congela la INVARIANTE DE HONESTIDAD del run de /analysis a nivel de reductor
 * puro (sin SDK ni red). Si un refactor del shell (B1) rompe alguna de estas, el
 * estado de UI estaría precediendo a su evento real — la línea roja del proyecto.
 */

// Estado tras lanzar (lo que setea handleRun): los tres narrativos en scanning.
const scanning: RunState = {
  ...INITIAL,
  ticker: 'AAPL',
  a1Status: 'scanning',
  a2Status: 'scanning',
  a3Status: 'scanning',
};

const ev = (e: Partial<StreamEvent> & { type: StreamEvent['type'] }): StreamEvent => e as StreamEvent;

describe('applyRunEvent — honestidad por evento', () => {
  it('un evento de agente solo cambia ESE agente (no enciende a los demás)', () => {
    const next = applyRunEvent(scanning, ev({ type: 'agent', agent: 'a1', status: 'done', data: { anomaly_detected: false } }));
    expect(next.a1Status).toBe('done');
    expect(next.a1).toEqual({ anomaly_detected: false });
    // Los otros NO se tocan: siguen en scanning hasta que llegue su propio evento.
    expect(next.a2Status).toBe('scanning');
    expect(next.a3Status).toBe('scanning');
    expect(next.a4Status).toBe('idle');
  });

  it('propaga el status real del stream (anomaly) sin inventarlo', () => {
    const next = applyRunEvent(scanning, ev({ type: 'agent', agent: 'a3', status: 'anomaly', data: { tendencia: {} } }));
    expect(next.a3Status).toBe('anomaly');
    expect(next.a1Status).toBe('scanning');
  });

  it('el evento de debate NO toca el estado de A1/A2/A3', () => {
    const next = applyRunEvent(scanning, ev({ type: 'debate', status: 'done', data: { direccion: 'positivo' } }));
    expect(next.debateStatus).toBe('done');
    expect(next.a1Status).toBe('scanning');
    expect(next.a2Status).toBe('scanning');
    expect(next.a3Status).toBe('scanning');
  });

  it('debate sin dato vuelve a idle (no se queda encendido)', () => {
    const next = applyRunEvent(scanning, ev({ type: 'debate', status: 'skipped', data: null }));
    expect(next.debateStatus).toBe('idle');
    expect(next.debate).toBeNull();
  });

  it('final resuelve A4 y RESCATA agentes colgados en scanning solo según su dato real', () => {
    // a1 colgado en scanning pero con dato+anomalía → anomaly; a3 colgado sin dato → error.
    const base: RunState = { ...scanning, a1: { anomaly_detected: true } as RunState['a1'], a3: null };
    const next = applyRunEvent(
      base,
      ev({ type: 'final', a4: {} as StreamEvent extends { a4: infer A } ? A : never, analysis_id: 'row-1' })
    );
    expect(next.a4Status).toBe('done');
    expect(next.analysisId).toBe('row-1');
    expect(next.a1Status).toBe('anomaly'); // tenía dato con anomalía
    expect(next.a3Status).toBe('error'); // scanning sin dato → NO se fabrica "done"
  });

  it('final NO modifica el status de un agente que no estaba en scanning', () => {
    const base: RunState = { ...scanning, a1Status: 'done', a2Status: 'idle' };
    const next = applyRunEvent(base, ev({ type: 'final', a4: {} as never }));
    expect(next.a1Status).toBe('done'); // ya resuelto, intacto
    expect(next.a2Status).toBe('idle'); // final no enciende a2
  });

  it('fatal lleva todo a error y clasifica el UserError', () => {
    const next = applyRunEvent(scanning, ev({ type: 'fatal', error: 'all_agents_failed' }));
    expect(next.a1Status).toBe('error');
    expect(next.a2Status).toBe('error');
    expect(next.a3Status).toBe('error');
    expect(next.a4Status).toBe('error');
    expect(next.error).not.toBeNull();
    expect(next.partial).toBe(false);
  });

  it('es PURO: no muta el estado de entrada', () => {
    const before = JSON.stringify(scanning);
    applyRunEvent(scanning, ev({ type: 'agent', agent: 'a1', status: 'done', data: {} }));
    expect(JSON.stringify(scanning)).toBe(before);
  });
});
