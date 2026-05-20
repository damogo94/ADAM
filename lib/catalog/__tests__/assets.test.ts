import { describe, it, expect } from 'vitest';
import { CATALOG, resolveTicker, findAsset } from '../assets';

describe('resolveTicker', () => {
  it('canónico passthrough', () => {
    expect(resolveTicker('AAPL')).toBe('AAPL');
    expect(resolveTicker('BTC')).toBe('BTC');
    expect(resolveTicker('EUR/USD')).toBe('EUR/USD');
  });

  it('case-insensitive', () => {
    expect(resolveTicker('aapl')).toBe('AAPL');
    expect(resolveTicker('btc')).toBe('BTC');
    expect(resolveTicker('eur/usd')).toBe('EUR/USD');
  });

  it('trim de whitespace', () => {
    expect(resolveTicker('  AAPL  ')).toBe('AAPL');
    expect(resolveTicker('\tBTC\n')).toBe('BTC');
  });

  it('resuelve aliases comunes', () => {
    expect(resolveTicker('GOLD')).toBe('GC=F');
    expect(resolveTicker('ORO')).toBe('GC=F');
    expect(resolveTicker('OIL')).toBe('USO');
    expect(resolveTicker('PETROLEO')).toBe('USO');
    expect(resolveTicker('SP500')).toBe('SPY');
    expect(resolveTicker('NASDAQ')).toBe('QQQ');
    expect(resolveTicker('BITCOIN')).toBe('BTC');
    expect(resolveTicker('FACEBOOK')).toBe('META');
  });

  it('aliases case-insensitive', () => {
    expect(resolveTicker('gold')).toBe('GC=F');
    expect(resolveTicker('Bitcoin')).toBe('BTC');
  });

  it('passthrough para tickers desconocidos', () => {
    expect(resolveTicker('UNKNOWN')).toBe('UNKNOWN');
    expect(resolveTicker('ZZZZ.MC')).toBe('ZZZZ.MC');
  });

  it('input vacío devuelve vacío', () => {
    expect(resolveTicker('')).toBe('');
    expect(resolveTicker('   ')).toBe('');
  });
});

describe('findAsset', () => {
  it('encuentra por ticker canónico', () => {
    const a = findAsset('AAPL');
    expect(a?.label).toBe('Apple');
    expect(a?.category).toBe('equities');
    expect(a?.asset_type).toBe('equity');
  });

  it('case-insensitive', () => {
    expect(findAsset('aapl')?.ticker).toBe('AAPL');
  });

  it('undefined para no encontrados', () => {
    expect(findAsset('NOPE')).toBeUndefined();
  });
});

describe('CATALOG — integridad', () => {
  it('no tiene tickers duplicados', () => {
    const tickers = CATALOG.map((a) => a.ticker.toUpperCase());
    const dup = tickers.filter((t, i) => tickers.indexOf(t) !== i);
    expect(dup).toEqual([]);
  });

  it('alias nunca colisiona con un ticker canónico', () => {
    const tickerSet = new Set(CATALOG.map((a) => a.ticker.toUpperCase()));
    const collisions: string[] = [];
    for (const a of CATALOG) {
      for (const alias of a.aliases ?? []) {
        if (tickerSet.has(alias.toUpperCase())) {
          collisions.push(`${alias} (alias de ${a.ticker}) colisiona con ticker canónico`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it('alias nunca está duplicado entre activos', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const a of CATALOG) {
      for (const alias of a.aliases ?? []) {
        const key = alias.toUpperCase();
        const prev = seen.get(key);
        if (prev) {
          collisions.push(`${alias}: ${prev} vs ${a.ticker}`);
        } else {
          seen.set(key, a.ticker);
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it('todos los assets tienen label no vacío', () => {
    const empty = CATALOG.filter((a) => !a.label.trim());
    expect(empty).toEqual([]);
  });

  it('asset_type es válido (enum DB)', () => {
    const allowed = new Set(['equity', 'etf', 'crypto', 'forex', 'commodity', 'bond']);
    const invalid = CATALOG.filter((a) => !allowed.has(a.asset_type));
    expect(invalid).toEqual([]);
  });

  it('todas las categorías representadas', () => {
    const cats = new Set(CATALOG.map((a) => a.category));
    expect(cats).toEqual(
      new Set(['metals', 'indices', 'commodities', 'equities', 'etf', 'crypto', 'forex'])
    );
  });

  /**
   * REGRESSION GUARD — el regex anti-prompt-injection vive duplicado en 6
   * endpoints (/api/agents/{run,a1,a2,a3,a4} + /api/market/quote{,s}).
   * Si añades un ticker al catálogo con un carácter no soportado por el
   * regex, el endpoint devuelve 400 "Entrada inválida" y el usuario ve
   * "error en A1/A2/A3 — reintenta" sin más pista. Ya pasó con `GC=F`
   * (caracter `=`) tras introducir los futuros de metales.
   *
   * Mantén ESTE regex sincronizado con el de los endpoints. Si alguno
   * diverge, los catalog tickers fallarían en runtime sin que este test
   * lo capture — la única defensa real sería centralizar la constante.
   */
  it('todos los tickers del catálogo pasan el regex anti-injection de los endpoints', () => {
    const ENDPOINT_REGEX = /^[A-Z0-9.\-/=^]+$/i;
    const failures = CATALOG.filter((a) => !ENDPOINT_REGEX.test(a.ticker)).map((a) => a.ticker);
    expect(failures).toEqual([]);
  });

  it('todos los tickers del catálogo caben en 20 chars (cap del schema Zod)', () => {
    const tooLong = CATALOG.filter((a) => a.ticker.length > 20).map((a) => a.ticker);
    expect(tooLong).toEqual([]);
  });
});
