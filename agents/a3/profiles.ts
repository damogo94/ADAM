/**
 * A.D.A.M. — AssetProfile (PR5)
 *
 * Parametriza el COMPUTE layer de A3 por clase de activo. La clase se deriva
 * DETERMINÍSTICAMENTE del ticker (catálogo + heurísticas Yahoo), por lo que
 * no introduce información externa al sistema.
 *
 * ⚠️ NO TOCAR sin entender las "reglas absolutas" del proyecto:
 *
 *   1. runA3({ticker, ohlcv}) sigue siendo la única firma válida.
 *   2. El prompt de A3 NO cambia — `AssetProfile` afecta solo a compute.ts,
 *      no entra al userMessage del LLM.
 *   3. Tests de isolation (FORBIDDEN_TERMS + snapshot) pasan tal cual.
 *
 * Por qué esto NO rompe el aislamiento:
 *   La clase de un activo es propiedad ESTRUCTURAL del ticker — derivable
 *   del propio símbolo. No es contexto de mercado, noticias, ni sentimiento.
 *   "AAPL es equity, BTC es crypto" lo dice el ticker mismo.
 *
 * Calibración v1 (2026-05-20) — conservadora, no es versión final:
 *   Los valores se ajustarán cuando haya N≥50 outcomes desagregados por
 *   clase (priority #5 del owner). Hasta entonces, los profiles solo
 *   reescalan magnitudes para evitar señales evidentemente absurdas
 *   (ej. proximidad de 3% en EUR/USD = ~330 pips).
 */

import { findAsset, type CatalogAsset } from '@/lib/catalog/assets';

export type AssetClass =
  | 'crypto'
  | 'forex'
  | 'equity'
  | 'commodity'
  | 'index_etf'
  | 'bond_etf';

export interface AssetProfile {
  class: AssetClass;
  /**
   * Proximidad % al nivel técnico para considerar "entrada limpia" en
   * operative.ts. Sin esto, EUR/USD aceptaba un setup a 3% del soporte
   * (=330 pips, no es "cerca").
   */
  proximity_pct: number;
  /**
   * Fallback del stop cuando ATR es null — % sobre el precio actual.
   * Necesario porque ATR puede ser null si <14 velas. Sin profile, todo
   * usaba 1% genérico → para BTC eso es ruido intradía, para una acción
   * defensiva es un stop irrealmente lejano.
   */
  atr_fallback_pct: number;
  /**
   * R/B mínimo aceptable para emitir señal (vs. hold). Para crypto donde
   * el spread y volatilidad ya quitan margen, exigimos algo mayor.
   * Para bonds donde los movimientos son chicos, algo menor.
   */
  min_rb_ratio: number;
  /**
   * Decimales para round() de niveles. Forex requiere 5 (= pip),
   * crypto/equity 2 cubre céntimos. Sin esto, EUR/USD 1.08543 se
   * redondeaba a 1.09 → niveles inútiles.
   */
  round_decimals: 2 | 4 | 5;
  /**
   * Tolerancia % para CLUSTERING de pivots en detectLevels (ADR-002, fase 1).
   * Dos swings dentro de esta banda se consideran el MISMO nivel. El default
   * histórico de detectLevels (0.5%) es demasiado fino para activos volátiles
   * → casi nunca formaba clusters de 2 toques → A3 sin niveles → 94% hold.
   * Escala con la volatilidad de la clase (cripto ancho, forex/bonos fino).
   * v1 conservadora — se recalibra con outcomes.
   */
  level_tolerance_pct: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Calibración v1 — comentarios explican el "por qué" de cada número.
// ───────────────────────────────────────────────────────────────────────────

const PROFILES: Record<AssetClass, AssetProfile> = {
  /**
   * FOREX — pares de divisas mayores y crosses.
   *   proximity 0.5%  ≈ 50 pips en EUR/USD — "cerca" en sentido swing
   *                     intradía. Lo justo para que el setup sea ejecutable.
   *   atr_fallback 0.4% — los pares mayores se mueven ~0.6-1% diario; 0.4%
   *                       como stop fallback es agresivo pero no irreal.
   *   rb 1.5      — convencional. Los pares mayores no justifican exigir más.
   *   decimals 5  — pip = 4ª decimal, micro-pip = 5ª. Tradingview/Bloomberg
   *                  conv.
   */
  forex: {
    class: 'forex',
    proximity_pct: 0.5,
    atr_fallback_pct: 0.4,
    min_rb_ratio: 1.5,
    round_decimals: 5,
    level_tolerance_pct: 0.3, // pares mayores: niveles finos, ~30 pips
  },

  /**
   * CRYPTO — BTC, ETH, alts.
   *   proximity 4%   — BTC se mueve ±5% diario sin noticias. 4% para
   *                    "entrada cerca de soporte" refleja el ruido real.
   *                    Menos sería rechazar setups limpios constantemente.
   *   atr_fallback 3% — similar razonamiento, stop fallback más laxo.
   *   rb 2.0         — crypto cobra spread + slippage en exchanges retail.
   *                    Exigir 2:1 compensa la fricción operativa.
   *   decimals 2     — BTC en $50k, 2 decimales basta. (Si añadimos
   *                    altcoins <$1 habría que mirar — ej. SHIB necesita
   *                    más decimales — pero no están en catálogo todavía.)
   */
  crypto: {
    class: 'crypto',
    proximity_pct: 4,
    atr_fallback_pct: 3,
    min_rb_ratio: 2.0,
    round_decimals: 2,
    level_tolerance_pct: 1.5, // ±5% diario: 0.5% no agrupaba nada
  },

  /**
   * EQUITY — acciones individuales (US + EU + UK + JP + HK).
   *   proximity 3%    — idéntico al default histórico (compat con tests).
   *   atr_fallback 1% — idéntico al default histórico.
   *   rb 1.5          — idéntico al default histórico.
   *   decimals 2      — ticks de centavo. OK para todo equity moderno.
   *
   *   ⚠️ Este profile = valores anteriores al PR5. Es la baseline contra
   *   la que medir si la calibración aporta. Si los outcomes muestran que
   *   los otros profiles mejoran hit-rate pero equity empeora, revisamos.
   */
  equity: {
    class: 'equity',
    proximity_pct: 3,
    atr_fallback_pct: 1,
    min_rb_ratio: 1.5,
    round_decimals: 2,
    level_tolerance_pct: 1.0, // acciones individuales: vol media
  },

  /**
   * COMMODITY — metales spot (XAU/USD), petróleo, agricultura.
   *   proximity 2%   — más estricto que equity. El oro spot se mueve
   *                    típicamente ~0.5-1% diario; 2% es swing claro.
   *                    Para petróleo (USO) puede sentir corto, ajustar
   *                    con outcomes.
   *   atr_fallback 1.5% — entre equity y crypto, refleja vol media.
   *   rb 1.5         — convencional.
   *   decimals 2     — XAU a $2000, 2 decimales basta.
   */
  commodity: {
    class: 'commodity',
    proximity_pct: 2,
    atr_fallback_pct: 1.5,
    min_rb_ratio: 1.5,
    round_decimals: 2,
    level_tolerance_pct: 0.7,
  },

  /**
   * INDEX_ETF — SPY, QQQ, DIA, IWM, EZU, EWG, etc.
   *   proximity 1.5% — los índices broad son menos volátiles que cualquier
   *                    componente individual. Un 1.5% en SPY es un
   *                    movimiento significativo.
   *   atr_fallback 0.8% — stops más ajustados — la vol diaria del SPY es
   *                       típicamente <1%.
   *   rb 1.5         — convencional.
   *   decimals 2.
   */
  index_etf: {
    class: 'index_etf',
    proximity_pct: 1.5,
    atr_fallback_pct: 0.8,
    min_rb_ratio: 1.5,
    round_decimals: 2,
    level_tolerance_pct: 0.5, // índices broad: menos volátiles
  },

  /**
   * BOND_ETF — TLT, HYG, etc.
   *   proximity 0.5% — los bonos se mueven en décimas. 0.5% es estructura
   *                    real, no ruido.
   *   atr_fallback 0.4% — stops chicos por la baja vol.
   *   rb 1.2         — los moves son chicos → exigir 1.5:1 deja casi todo
   *                    en hold. Bajamos a 1.2 para no quedar bloqueados.
   *   decimals 2.
   */
  bond_etf: {
    class: 'bond_etf',
    proximity_pct: 0.5,
    atr_fallback_pct: 0.4,
    min_rb_ratio: 1.2,
    round_decimals: 2,
    level_tolerance_pct: 0.3, // bonos: moves en décimas
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Resolución ticker → clase. Dos fuentes en cascada:
//   1. CATALOG (lib/catalog) — fuente curada, fiable.
//   2. Heurísticas Yahoo — convenciones públicas (=X, -USD, sufijos .MC…).
// ───────────────────────────────────────────────────────────────────────────

const CRYPTO_SOLO = new Set([
  'BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'BNB', 'DOGE',
  'DOT', 'AVAX', 'MATIC', 'LINK', 'LTC', 'ATOM', 'UNI', 'XLM',
]);
const METAL_BASES = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
const EQUITY_SUFFIXES = /\.(MC|PA|DE|L|AS|MI|SW|T|JP|HK|TO|SS|BO|NS|KS)$/;

export function classOf(ticker: string): AssetClass {
  const t = ticker.trim().toUpperCase();
  if (!t) return 'equity';

  // 1. Catálogo curado primero — la única fuente que conoce que GLD es
  // commodity (no equity-etf) o que TLT es bond_etf.
  const fromCat = catalogClass(findAsset(t));
  if (fromCat) return fromCat;

  // 2. Yahoo forex EURUSD=X
  if (/=X$/.test(t)) return 'forex';

  // 3. Par 3+3 letras — distinguir metales spot vs forex
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(t)) {
    const base = t.split('/')[0]!;
    if (METAL_BASES.has(base)) return 'commodity';
    return 'forex';
  }

  // 4. Crypto pair canónico (BTC-USD, ETH-USDT…)
  if (/^[A-Z]+-(USD|USDT|USDC|EUR|BTC)$/.test(t)) return 'crypto';

  // 5. Crypto símbolo solo (BTC, ETH…)
  if (CRYPTO_SOLO.has(t)) return 'crypto';

  // 6. Yahoo índice raw ^GSPC
  if (/^\^/.test(t)) return 'index_etf';

  // 7. Equity internacional con sufijo de bolsa
  if (EQUITY_SUFFIXES.test(t)) return 'equity';

  // 8. Default conservador. Equity = valores históricos = comportamiento
  // pre-PR5 → safe.
  return 'equity';
}

function catalogClass(asset: CatalogAsset | undefined): AssetClass | null {
  if (!asset) return null;
  if (asset.asset_type === 'bond') return 'bond_etf';
  if (asset.asset_type === 'crypto') return 'crypto';
  if (asset.asset_type === 'forex') return 'forex';
  if (asset.asset_type === 'commodity') return 'commodity';
  // equity + etf — mira la categoría UI para distinguir índices/metales/sector
  if (asset.category === 'indices') return 'index_etf';
  if (asset.category === 'metals' || asset.category === 'commodities') return 'commodity';
  return 'equity';
}

export function profileFor(ticker: string): AssetProfile {
  return PROFILES[classOf(ticker)];
}

/** Round con decimales del profile. Reemplaza el `round2()` genérico. */
export function roundProfile(n: number, profile: AssetProfile): number {
  const factor = 10 ** profile.round_decimals;
  return Math.round(n * factor) / factor;
}
