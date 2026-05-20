/**
 * Categorías del catálogo de activos.
 *
 * Capa de UI — agrupa tiles en el AssetPicker. NO se confunde con
 * `AssetType` (enum DB de la watchlist). Mapeo en `lib/catalog/assets.ts`.
 *
 * Decisión: indices se representan vía ETF (SPY, QQQ…) y no vía símbolo
 * raw ^GSPC porque el pipeline está validado contra tickers con OHLCV
 * completo, y Yahoo a veces no devuelve volumen para índices puros.
 */
export type Category =
  | 'metals'
  | 'indices'
  | 'commodities'
  | 'equities'
  | 'etf'
  | 'crypto'
  | 'forex';

export interface CategoryMeta {
  id: Category;
  label: string;
  /** Glifo monocromo coherente con la estética Deep Space Terminal. */
  glyph: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'metals',      label: 'metales',     glyph: '◆' },
  { id: 'indices',     label: 'índices',     glyph: '⊞' },
  { id: 'commodities', label: 'materias primas', glyph: '⏣' },
  { id: 'equities',    label: 'acciones',    glyph: '▣' },
  { id: 'etf',         label: 'etf',         glyph: '◫' },
  { id: 'crypto',      label: 'cripto',      glyph: '◉' },
  { id: 'forex',       label: 'forex',       glyph: '⇄' },
];

export function categoryLabel(c: Category): string {
  return CATEGORIES.find((x) => x.id === c)?.label ?? c;
}
