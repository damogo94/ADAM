/**
 * Formateo es-ES para la landing /inicio. Los datos del ejemplo se guardan como
 * NÚMEROS (components/inicio/example.ts); aquí se formatean a coma decimal,
 * signo y %. No formatear en los datos — solo en la capa de presentación.
 */

/** Precio con 2 decimales: 212 → "212,00". */
export function formatPrice(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** κ con 2 decimales: 0.9 → "0,90". */
export function formatKappa(k: number): string {
  return k.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Entero (para count-up del gauge / accionable). */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('es-ES');
}

export interface ChangeFormat {
  /** ▲ (≥0) · ▼ (<0) — flecha de dirección (dato de mercado). */
  glyph: string;
  /** "+1,8%" · "−0,6%" (minus tipográfico U+2212). */
  label: string;
  /** Para derivar el tono de mercado (up/down) del signo. */
  positive: boolean;
}

/** Variación 24h con signo + flecha. El COLOR lo decide el llamador vía tono. */
export function formatChange(pct: number): ChangeFormat {
  const positive = pct >= 0;
  const abs = Math.abs(pct).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return {
    glyph: positive ? '▲' : '▼',
    label: `${positive ? '+' : '−'}${abs}%`,
    positive,
  };
}

/** Capitaliza la primera letra (NEUTRAL → "Neutral") para etiquetas de nivel. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
