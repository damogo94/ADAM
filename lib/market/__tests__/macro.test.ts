import { describe, it, expect } from 'vitest';
import { computeCpiYoy, computeCpiTrend, isEffectivelyEmpty } from '../macro';
import type { FredObservation } from '../fred';
import type { MacroSnapshotPayload } from '../macro';

/**
 * Helper para fabricar observaciones FRED en orden descendente
 * (más reciente primero, como devuelve la API con sort_order=desc).
 */
function obs(values: (number | null)[]): FredObservation[] {
  return values.map((v, i) => ({
    date: `2026-${String(5 - Math.floor(i / 12)).padStart(2, '0')}-01`,
    value: v,
  }));
}

describe('computeCpiYoy', () => {
  it('devuelve null si hay < 13 observaciones', () => {
    expect(computeCpiYoy(obs([300, 299, 298]))).toBeNull();
  });

  it('calcula YoY como porcentaje', () => {
    // latest 310, hace 12 meses 300 → 3.33%
    const series = obs([310, 309, 308, 307, 306, 305, 304, 303, 302, 301, 300.5, 300.2, 300]);
    expect(computeCpiYoy(series)).toBeCloseTo(3.333, 2);
  });

  it('devuelve null si yearAgo es 0 o null', () => {
    const series = obs([310, 309, 308, 307, 306, 305, 304, 303, 302, 301, 300.5, 300.2, null]);
    expect(computeCpiYoy(series)).toBeNull();
  });
});

describe('computeCpiTrend', () => {
  it('devuelve null si hay < 15 observaciones', () => {
    expect(computeCpiTrend(obs([300, 299, 298]))).toBeNull();
  });

  it("'bajando' cuando YoY actual < YoY hace 2 meses con delta > 0.1pp", () => {
    // Construyo serie donde el CPI sube cada vez más despacio en los últimos
    // meses → YoY descendente.
    //
    // 15 meses (más reciente primero). Idea: meses 0,1,2 crecen poco respecto
    // a 12,13,14. Concretamente:
    //   obs[0]=310 vs obs[12]=305 → YoY=1.64%
    //   obs[1]=309 vs obs[13]=303 → YoY=1.98%
    //   obs[2]=308 vs obs[14]=300 → YoY=2.67%
    // delta = 1.64 - 2.67 = -1.03 → 'bajando'
    const series = obs([310, 309, 308, 307, 306, 305.5, 305, 304.5, 304, 303.5, 303, 302, 305, 303, 300]);
    expect(computeCpiTrend(series)).toBe('bajando');
  });

  it("'subiendo' cuando YoY actual > YoY hace 2 meses con delta > 0.1pp", () => {
    // CPI acelerando: YoY más reciente más alto que el de hace 2 meses.
    //   obs[0]=310 vs obs[12]=300 → YoY=3.33%
    //   obs[1]=308 vs obs[13]=300 → YoY=2.67%
    //   obs[2]=306 vs obs[14]=300 → YoY=2.00%
    // delta = 3.33 - 2.00 = +1.33 → 'subiendo'
    const series = obs([310, 308, 306, 304, 303, 302, 301.5, 301, 300.8, 300.5, 300.3, 300.1, 300, 300, 300]);
    expect(computeCpiTrend(series)).toBe('subiendo');
  });

  it("'estable' cuando |delta| < 0.1pp", () => {
    // Todos los meses crecen casi exactamente igual.
    const series = obs([303, 303, 303, 302.5, 302.5, 302.5, 302, 302, 302, 301.5, 301.5, 301.5, 300, 300, 300]);
    expect(computeCpiTrend(series)).toBe('estable');
  });
});

describe('isEffectivelyEmpty', () => {
  function snap(overrides: Partial<MacroSnapshotPayload> = {}): MacroSnapshotPayload {
    return {
      fed_funds_rate_pct: null,
      us_10y_yield_pct: null,
      us_2y_yield_pct: null,
      cpi_yoy_pct: null,
      cpi_trend: null,
      unemployment_pct: null,
      vix: null,
      curva_invertida: null,
      as_of: '2026-05-20',
      ...overrides,
    };
  }

  it('todos los indicadores principales null → vacío', () => {
    expect(isEffectivelyEmpty(snap())).toBe(true);
  });

  it('un solo indicador con valor → no vacío', () => {
    expect(isEffectivelyEmpty(snap({ vix: 18.5 }))).toBe(false);
    expect(isEffectivelyEmpty(snap({ fed_funds_rate_pct: 4.5 }))).toBe(false);
    expect(isEffectivelyEmpty(snap({ cpi_yoy_pct: 2.8 }))).toBe(false);
  });

  it('snapshot completo → no vacío', () => {
    const full = snap({
      fed_funds_rate_pct: 4.5,
      us_10y_yield_pct: 4.2,
      us_2y_yield_pct: 4.6,
      cpi_yoy_pct: 2.8,
      unemployment_pct: 3.9,
      vix: 18.5,
      curva_invertida: true,
    });
    expect(isEffectivelyEmpty(full)).toBe(false);
  });

  it('solo curva_invertida y as_of (campos derivados) → vacío', () => {
    // Los derivados no cuentan: pueden existir sin indicadores reales.
    expect(isEffectivelyEmpty(snap({ curva_invertida: false }))).toBe(true);
  });
});
