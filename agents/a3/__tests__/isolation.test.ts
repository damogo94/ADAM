import { describe, it, expect } from 'vitest';
import { A3_SYSTEM_PROMPT } from '../prompt';
import { A3_OUTPUT_SCHEMA } from '../schema';
import { runA3, type A3Input } from '../client';
import { narrateA3, type NarrateA3Input } from '../narrate';

const FORBIDDEN_TERMS = [
  'Fear & Greed Index',
  'VIX',
  'sentimiento',
  'sentiment',
  'NOTICIAS',
  'Earnings',
  'Política',
  'Geopolítica',
  'macroeconómico',
  'fundamental',
  'A1',
  'A2',
  'A4',
];

const ALLOWED_TOOLS = [
  'Tendencia',
  'Soportes',
  'Medias móviles',
  'SMA 20/50/200',
  'EMA 12/26',
  'VWAP',
  'Golden Cross',
  'Death Cross',
  'ATR',
  'Volumen',
];

const VALID_OHLCV: A3Input['ohlcv'] = [
  { timeframe: '1D', candles: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] },
];

describe('A3 isolation — capa 1: system prompt blacklist', () => {
  for (const term of FORBIDDEN_TERMS) {
    it(`menciona explícitamente "${term}" como prohibido`, () => {
      expect(A3_SYSTEM_PROMPT).toContain(term);
    });
  }

  for (const tool of ALLOWED_TOOLS) {
    it(`menciona la herramienta permitida "${tool}"`, () => {
      expect(A3_SYSTEM_PROMPT).toContain(tool);
    });
  }

  it('contiene la sección "PROHIBICIÓN TOTAL Y SIN EXCEPCIONES"', () => {
    expect(A3_SYSTEM_PROMPT).toMatch(/PROHIBICIÓN TOTAL Y SIN EXCEPCIONES/);
  });

  it('declara al usuario como único comandante', () => {
    expect(A3_SYSTEM_PROMPT).toMatch(/USUARIO es tu único comandante/i);
  });

  it('snapshot del prompt — cambios fuerzan review', () => {
    expect(A3_SYSTEM_PROMPT).toMatchSnapshot();
  });
});

describe('A3 isolation — capa 2: firma de runA3()', () => {
  it('rechaza un campo extra "news" antes de llamar al SDK', async () => {
    const badInput = {
      ticker: 'AAPL',
      ohlcv: VALID_OHLCV,
      news: ['fake'],
    } as unknown as A3Input;

    await expect(runA3(badInput)).rejects.toThrow(/A3 isolation violation/);
  });

  it('rechaza un campo extra "sentiment"', async () => {
    const badInput = {
      ticker: 'AAPL',
      ohlcv: VALID_OHLCV,
      sentiment: { fear: 30 },
    } as unknown as A3Input;

    await expect(runA3(badInput)).rejects.toThrow(/A3 isolation violation/);
  });

  it('rechaza un campo extra "macro"', async () => {
    const badInput = {
      ticker: 'AAPL',
      ohlcv: VALID_OHLCV,
      macro: { cpi: 3.2 },
    } as unknown as A3Input;

    await expect(runA3(badInput)).rejects.toThrow(/A3 isolation violation/);
  });

  it('rechaza outputs de A1 colados como contexto', async () => {
    const badInput = {
      ticker: 'AAPL',
      ohlcv: VALID_OHLCV,
      a1_output: { confidence: 5 },
    } as unknown as A3Input;

    await expect(runA3(badInput)).rejects.toThrow(/A3 isolation violation/);
  });
});

describe('A3 isolation — capa 2: firma de narrateA3() (path vivo del pipeline)', () => {
  // El guard runtime corre ANTES de compute/LLM, así que un input con claves
  // extra tira sin necesidad de API key ni mocks. ohlcv vacío vale: nunca se
  // llega a usarlo.
  const baseOhlcv = [] as NarrateA3Input['ohlcv'];

  it('rechaza un campo extra "news"', async () => {
    const badInput = {
      ticker: 'AAPL',
      ohlcv: baseOhlcv,
      news: ['fake'],
    } as unknown as NarrateA3Input;
    await expect(narrateA3(badInput)).rejects.toThrow(/A3 isolation violation/);
  });

  it('rechaza outputs de A2 (macro) colados como contexto', async () => {
    const badInput = {
      ticker: 'AAPL',
      ohlcv: baseOhlcv,
      a2_output: { regime_outlook: 'alcista' },
    } as unknown as NarrateA3Input;
    await expect(narrateA3(badInput)).rejects.toThrow(/A3 isolation violation/);
  });

  it('rechaza sentiment / fear & greed', async () => {
    const badInput = {
      ticker: 'AAPL',
      ohlcv: baseOhlcv,
      sentiment: { fear_greed: 30 },
    } as unknown as NarrateA3Input;
    await expect(narrateA3(badInput)).rejects.toThrow(/A3 isolation violation/);
  });
});

describe('A3 isolation — capa 3: schema de output limpio', () => {
  const schemaKeys = Object.keys(A3_OUTPUT_SCHEMA.shape);

  it('no expone campos sentiment/news/macro en el schema de output', () => {
    const polluted = ['sentiment', 'news', 'macro', 'fear_greed', 'vix', 'fundamentals'];
    for (const key of polluted) {
      expect(schemaKeys).not.toContain(key);
    }
  });

  it('expone campos esperados de price action', () => {
    const required = [
      'ticker',
      'timeframes_analizados',
      'tendencia',
      'soportes',
      'resistencias',
      'medias',
      'volumen',
      'operativa',
      'factor_invalidacion',
      'confidence',
    ];
    for (const key of required) {
      expect(schemaKeys).toContain(key);
    }
  });
});
