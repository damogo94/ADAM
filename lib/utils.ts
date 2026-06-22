import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtPct(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/**
 * Formatea precio con su moneda. Por defecto usa Intl con símbolo
 * ($, €, £), pero algunas monedas (USDT, BTC, ETH) no son ISO 4217
 * y Intl revienta — caemos a sufijo plano.
 */
export function fmtPrice(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/**
 * Formato compacto número + moneda separada (para tablas tipo KV).
 *   fmtPriceCompact(298.87, 'USD') → "298.87 USD"
 *   fmtPriceCompact(0.000123, 'BTC') → "0.000123 BTC"
 */
export function fmtPriceCompact(value: number | null | undefined, currency = 'USD', digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  // BTC / micros: muestra más decimales
  const d = Math.abs(value) < 1 ? Math.max(digits, 6) : digits;
  return `${value.toFixed(d)} ${currency}`;
}

/**
 * Market cap / valores grandes en notación compacta con prefijo $.
 *   fmtMarketCap(1_300_000_000_000) → "$1.3T"
 *   fmtMarketCap(8_500_000_000)     → "$8.5B"
 *   fmtMarketCap(null)              → "—"
 */
export function fmtMarketCap(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`;
}

/**
 * Infiere la moneda de cotización desde el ticker.
 *
 *   AAPL, MSFT, SPY      → USD (default equities)
 *   BTC-USD, ETH-USDT    → segundo segmento
 *   EUR/USD, GBP/JPY     → segundo segmento (forex)
 *   GOLD, OIL, WTI       → USD (commodities globales)
 *   IBE.MC (Madrid)      → EUR (sufijo .MC = Bolsa Madrid)
 *
 * No es exhaustivo — para tickers exóticos cae a USD silencioso.
 * Si A1Output trae explicit currency (vía OVERVIEW de AV), prefiere esa.
 */
export function getCurrencyFromTicker(ticker: string): string {
  if (!ticker) return 'USD';
  const t = ticker.toUpperCase();
  // Crypto pair: BTC-USD, ETH-USDT
  if (t.includes('-')) {
    const part = t.split('-')[1];
    if (part && /^[A-Z]{3,5}$/.test(part)) return part;
  }
  // Forex pair: EUR/USD, GBP/JPY
  if (t.includes('/')) {
    const part = t.split('/')[1];
    if (part && /^[A-Z]{3}$/.test(part)) return part;
  }
  // Suffix .MC, .L, .PA, .DE — bolsas europeas
  if (t.endsWith('.MC') || t.endsWith('.PA') || t.endsWith('.AS') || t.endsWith('.MI') || t.endsWith('.DE')) {
    return 'EUR';
  }
  if (t.endsWith('.L')) return 'GBP';
  if (t.endsWith('.T') || t.endsWith('.JP')) return 'JPY';
  if (t.endsWith('.HK')) return 'HKD';
  // Crypto ticker desnudo
  if (['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'BNB', 'DOGE'].includes(t)) return 'USD';
  return 'USD';
}

/**
 * Fecha actual en formato YYYY-MM-DD UTC, para inyectar en prompts de
 * agentes. Los LLMs tienen training cutoff antiguo, sin este date stamp
 * podrían analizar precios como si fueran de su training year en vez
 * del año real.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Date contexto humano-legible para prompts.
 *   "miércoles 14 de mayo de 2026 (UTC)"
 */
export function todayContext(): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${fmt.format(d)} (UTC)`;
}
