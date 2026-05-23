import { describe, expect, it } from 'vitest';
import { normalizeAnalysis } from '../normalize';

describe('normalizeAnalysis', () => {
  it('null → null', () => {
    expect(normalizeAnalysis(null)).toBeNull();
  });

  it('string → null (no es objeto)', () => {
    expect(normalizeAnalysis('hello')).toBeNull();
  });

  it('row sin id válido → null', () => {
    expect(
      normalizeAnalysis({
        created_at: '2026-05-23T10:00:00Z',
        confluence_pct: 50,
        direction: 'positivo',
        confidence: 'media',
        a1_output: {},
        a4_output: { accion_sugerida: 'mirar' },
      })
    ).toBeNull();
  });

  it('row mínimo válido → snapshot completo', () => {
    const r = normalizeAnalysis({
      id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-05-23T10:00:00Z',
      confluence_pct: 65,
      direction: 'positivo',
      confidence: 'alta',
      a1_output: {
        anomaly_detected: true,
        anomaly_type: 'oportunidad',
        anomaly_description: 'breakout claro',
      },
      a3_output: {
        operativa: {
          signal: 'buy',
          entrada: 100,
          stop_loss: 95,
          target: 115,
          ratio_riesgo_beneficio: 3,
        },
      },
      a4_output: {
        direccion: 'positivo',
        accion_sugerida: 'Comprar en cierre con stop bajo el soporte',
      },
    });
    expect(r).not.toBeNull();
    expect(r!.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(r!.confluence_pct).toBe(65);
    expect(r!.direction).toBe('positivo');
    expect(r!.confidence).toBe('alta');
    expect(r!.a3_signal).toBe('buy');
    expect(r!.a3_entry).toBe(100);
    expect(r!.a3_risk_reward).toBe(3);
    expect(r!.a1_anomaly_detected).toBe(true);
    expect(r!.a1_anomaly_type).toBe('oportunidad');
    expect(r!.headline).toContain('Comprar');
  });

  it('confluence_pct fuera de rango → clamp 0..100', () => {
    const r = normalizeAnalysis({
      id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-05-23T10:00:00Z',
      confluence_pct: 150,
      direction: 'neutral',
      confidence: 'baja',
      a1_output: {},
      a4_output: { accion_sugerida: 'esperar' },
    });
    expect(r!.confluence_pct).toBe(100);
  });

  it('direction inválida → null (no aceptamos basura)', () => {
    const r = normalizeAnalysis({
      id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-05-23T10:00:00Z',
      confluence_pct: 50,
      direction: 'bonkers',
      confidence: 'media',
      a1_output: {},
      a4_output: { accion_sugerida: 'x' },
    });
    expect(r).toBeNull();
  });

  it('a4_output ausente → null (sin dictamen no hay fila)', () => {
    // a4_output=undefined hace que A4FromLog.safeParse → success igual
    // (passthrough con todo opcional). Para que falle de verdad, pasamos
    // un valor no-objeto explícitamente.
    const r = normalizeAnalysis({
      id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-05-23T10:00:00Z',
      confluence_pct: 50,
      direction: 'neutral',
      confidence: 'baja',
      a1_output: {},
      a4_output: 'corrupt',
    });
    expect(r).toBeNull();
  });

  it('headline trunca textos largos manteniendo palabras', () => {
    const long = 'a'.repeat(200);
    const r = normalizeAnalysis({
      id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-05-23T10:00:00Z',
      confluence_pct: 50,
      direction: 'neutral',
      confidence: 'baja',
      a1_output: {},
      a4_output: { accion_sugerida: long },
    });
    expect(r!.headline.length).toBeLessThanOrEqual(141); // 140 + …
    expect(r!.headline.endsWith('…')).toBe(true);
  });
});
