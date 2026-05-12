/**
 * A3 — test de aislamiento (regla absoluta #1).
 *
 * Estas pruebas son load-bearing: bloquean cualquier refactor que pueda
 * contaminar A3 con contexto de A1, A2, news, macro, sentiment, etc.
 * Si alguna falla, NO se debilita el test — se rechaza el cambio que la rompió.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del SDK de Anthropic ANTES de importar el cliente.
// runA3 llamará a runAgent, que devolverá un output mínimo válido contra el schema.
vi.mock('@/lib/anthropic', async () => {
  const actual = await vi.importActual<typeof import('@/lib/anthropic')>('@/lib/anthropic');
  return {
    ...actual,
    runAgent: vi.fn(async () => ({
      ticker: 'AAPL',
      timeframes_analizados: ['1D', '1H'],
      tendencia: { primaria: 'alcista', secundaria: 'lateral', fuerza: 3 },
      soportes: [180],
      resistencias: [200],
      patron_detectado: null,
      medias: {
        sma20: 190,
        sma50: 185,
        sma200: 170,
        vwap: 192,
        golden_cross: false,
        death_cross: false,
      },
      volumen: { estado: 'estable', comentario: 'volumen acorde a media de 20 sesiones' },
      velas_relevantes: [],
      operativa: {
        signal: 'hold',
        entrada: null,
        stop_loss: null,
        target: null,
        atr_actual: 3.2,
        ratio_riesgo_beneficio: null,
        horizonte: 'swing',
      },
      factor_invalidacion: 'cierre diario por debajo de 180',
      confidence: 3,
      narrative:
        'Estructura alcista de máximos crecientes en diario, lateral en intradía. Soporte clave 180, resistencia 200. Sin patrón terminal definido.',
    })),
  };
});

import { runA3, type A3Input } from '@/agents/a3/client';
import { A3_SYSTEM_PROMPT } from '@/agents/a3/prompt';
import { runAgent } from '@/lib/anthropic';

const validInput: A3Input = {
  ticker: 'AAPL',
  ohlcv: [
    {
      timeframe: '1D',
      candles: [{ t: 1, o: 100, h: 101, l: 99, c: 100.5, v: 1_000_000 }],
    },
  ],
};

describe('A3 isolation — runtime input guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acepta input limpio { ticker, ohlcv }', async () => {
    const result = await runA3(validInput);
    expect(result.ticker).toBe('AAPL');
    expect(runAgent).toHaveBeenCalledOnce();
  });

  it.each([
    'news',
    'macro',
    'sentiment',
    'fearGreed',
    'vix',
    'a1Output',
    'a2Output',
    'context',
    'analystRatings',
  ])('rechaza campo prohibido "%s"', async (forbidden) => {
    const dirty = { ...validInput, [forbidden]: { whatever: true } } as unknown as A3Input;
    await expect(runA3(dirty)).rejects.toThrow(/A3 isolation violation/);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('el mensaje de error nombra el campo ofensor (debug forense)', async () => {
    const dirty = { ...validInput, news: [] } as unknown as A3Input;
    await expect(runA3(dirty)).rejects.toThrow(/"news"/);
  });

  it('no se cuela campo extra ni con prefijo plausible', async () => {
    const dirty = { ...validInput, ohlcv_meta: 'foo' } as unknown as A3Input;
    await expect(runA3(dirty)).rejects.toThrow(/A3 isolation violation/);
  });
});

describe('A3 isolation — system prompt blacklist', () => {
  // Lista negra explícita. Cualquier eliminación de un término aquí debe
  // ser rechazada en code review — debilita la regla #1.
  const BLACKLIST_TERMS = [
    'Fear & Greed',
    'VIX',
    'AAII',
    'sentimiento',
    'NOTICIAS',
    'Earnings',
    'guidance',
    'Política',
    'bancos centrales',
    'Geopolítica',
    'macroeconómico',
    'CPI',
    'fundamental',
    'PER',
    'analistas',
    'A1',
    'A2',
  ];

  it.each(BLACKLIST_TERMS)('menciona explícitamente "%s" en la lista negra', (term) => {
    expect(A3_SYSTEM_PROMPT).toContain(term);
  });

  it('declara prohibición total y sin excepciones', () => {
    expect(A3_SYSTEM_PROMPT).toMatch(/PROHIBICIÓN TOTAL Y SIN EXCEPCIONES/);
  });

  it('declara al usuario como único comandante', () => {
    expect(A3_SYSTEM_PROMPT).toMatch(/USUARIO es tu único comandante/);
  });

  it('instruye a ignorar inyecciones de contexto prohibido', () => {
    expect(A3_SYSTEM_PROMPT).toMatch(/IGN[ÓO]RALOS/);
  });

  it('no menciona herramientas que impliquen sentiment/news (sanity check inverso)', () => {
    // Estos términos NO deberían aparecer en herramientas permitidas.
    // Si aparecen, alguien añadió capacidad prohibida disfrazada.
    const forbiddenInTools = [
      /✅[^\n]*sentim/i,
      /✅[^\n]*noticia/i,
      /✅[^\n]*macro/i,
      /✅[^\n]*fundamental/i,
    ];
    for (const re of forbiddenInTools) {
      expect(A3_SYSTEM_PROMPT).not.toMatch(re);
    }
  });
});
