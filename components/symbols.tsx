/**
 * A.D.A.M. — Symbol library (re-skin B&W sesión 4).
 *
 * Los 5 símbolos del brand system son SVG vectoriales puros (no fuentes,
 * no iconos importados). Cada uno tiene un significado semántico fijo del
 * brand:
 *
 *   ◯  AnomalyLoop   — el ciclo roto · análisis · detección
 *   ⩘  SplitA        — fragmentación · módulos · watchlist
 *   ⊕  Observer      — observación global · señales activas
 *   AM Monogram      — sistema · ensamblado · identity
 *   /  Signal        — señal sobre ruido · alertas
 *
 * Uso típico:
 *   <AnomalyLoop className="w-4 h-4" />        // hereda currentColor
 *   <Signal className="w-3 h-3 text-white/60" />
 *
 * Para añadir un nuevo símbolo: copia el patrón, exporta. NO lo asocies
 * 1:1 con una pantalla — cualquier screen puede elegir cualquier símbolo.
 *
 * Todos heredan `currentColor` (stroke o fill) para que cambien con
 * `text-*` o `text-white/N`. Mantén `strokeWidth` consistente en ~1.5
 * para que la familia se vea coherente.
 */

interface SymbolProps {
  className?: string;
  /** Override del strokeWidth (default 1.5 — consistente con la familia) */
  strokeWidth?: number;
  title?: string;
}

const COMMON_PROPS = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// ─── 01. AnomalyLoop ────────────────────────────────────────────────
// Círculo roto — el patrón continuo interrumpido. Anomalía detectada.
export function AnomalyLoop({ className, strokeWidth = 1.5, title }: SymbolProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title ?? 'Anomaly loop'}>
      {title && <title>{title}</title>}
      <path
        {...COMMON_PROPS}
        strokeWidth={strokeWidth}
        d="M 12 3 A 9 9 0 0 1 21 12 M 21 12 A 9 9 0 0 1 16 19.8 M 8 19.8 A 9 9 0 0 1 3 12 M 3 12 A 9 9 0 0 1 12 3"
      />
    </svg>
  );
}

// ─── 02. SplitA ──────────────────────────────────────────────────────
// A partida por la mitad — fragmentación, módulos, separación.
export function SplitA({ className, strokeWidth = 1.5, title }: SymbolProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title ?? 'Split A'}>
      {title && <title>{title}</title>}
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 4 22 L 12 2 L 20 22" />
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 8 14 L 16 14" />
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 12 2 L 12 14" strokeDasharray="2 2" />
    </svg>
  );
}

// ─── 03. Observer ────────────────────────────────────────────────────
// Globo con meridianos — observación, red global, vigilancia.
export function Observer({ className, strokeWidth = 1.5, title }: SymbolProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title ?? 'Observer'}>
      {title && <title>{title}</title>}
      <ellipse {...COMMON_PROPS} strokeWidth={strokeWidth} cx="12" cy="12" rx="10" ry="10" />
      <ellipse {...COMMON_PROPS} strokeWidth={strokeWidth} cx="12" cy="12" rx="5" ry="10" />
      <line {...COMMON_PROPS} strokeWidth={strokeWidth} x1="2" y1="12" x2="22" y2="12" />
      <circle fill="currentColor" stroke="none" cx="17" cy="12" r="1" />
    </svg>
  );
}

// ─── 04. Monogram ────────────────────────────────────────────────────
// Las dos letras A·M entrelazadas. Identidad / sistema.
export function Monogram({ className, strokeWidth = 1.5, title }: SymbolProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title ?? 'A.D.A.M. monogram'}>
      {title && <title>{title}</title>}
      {/* A */}
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 2 21 L 8 3 L 14 21" />
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 5 14 L 11 14" />
      {/* M (compartiendo trazo con A) */}
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 11 21 L 11 7 L 16 14 L 21 7 L 21 21" />
    </svg>
  );
}

// ─── 05. Signal ──────────────────────────────────────────────────────
// 4 barras inclinadas — señal sobre ruido, alertas, interferencia.
export function Signal({ className, strokeWidth = 1.5, title }: SymbolProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title ?? 'Signal'}>
      {title && <title>{title}</title>}
      <line {...COMMON_PROPS} strokeWidth={strokeWidth * 1.4} x1="4" y1="20" x2="9" y2="4" />
      <line {...COMMON_PROPS} strokeWidth={strokeWidth * 1.4} x1="10" y1="20" x2="15" y2="4" />
      <line {...COMMON_PROPS} strokeWidth={strokeWidth * 2.2} x1="17" y1="20" x2="22" y2="4" />
    </svg>
  );
}

// ─── 06. Origin ──────────────────────────────────────────────────────
// Apertura concéntrica desde un punto — el origen del sistema, punto de
// entrada, génesis. Distinto de AnomalyLoop (círculo roto) y Observer
// (globo): aquí dos anillos casi cerrados rodean un núcleo sólido.
export function Origin({ className, strokeWidth = 1.5, title }: SymbolProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title ?? 'Origin'}>
      {title && <title>{title}</title>}
      <circle fill="currentColor" stroke="none" cx="12" cy="12" r="2" />
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 12 6.6 A 5.4 5.4 0 1 1 7.4 9.3" />
      <path {...COMMON_PROPS} strokeWidth={strokeWidth} d="M 12 2.8 A 9.2 9.2 0 1 0 17.2 4.6" />
    </svg>
  );
}

// ─── Catálogo (para iteración fácil — ej. bottom-nav, asset board) ──
export const SYMBOLS = {
  anomaly: AnomalyLoop,
  split: SplitA,
  observer: Observer,
  monogram: Monogram,
  signal: Signal,
  origin: Origin,
} as const;
export type SymbolName = keyof typeof SYMBOLS;
