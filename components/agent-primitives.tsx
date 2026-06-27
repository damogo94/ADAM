import { cn } from '@/lib/utils';

/**
 * Primitivos atómicos del rediseño verdict-first (ADAM_UI_REDESIGN).
 *
 * Dos ejes visuales SEPARADOS, nunca mezclados (FIREWALL):
 *   - CONFIANZA → intensidad de TINTA + accent (no es dato de mercado): baja=ink/45 ·
 *     media=ink/70 · alta=ink, con dot/barra en accent. JAMÁS emerald/amber/rose.
 *   - DIRECCIÓN → color/hue de MERCADO: alcista=emerald(▲) · bajista=rose(▼) · neutral=slate(■).
 * Confianza baja se atenúa (ink tenue), NUNCA en rojo (rojo = bajista, no "poco fiable").
 *
 * emerald/rose/amber SOLO en dato de mercado (dirección). Chrome/confianza = ink/accent.
 */

// ─── Dirección ───────────────────────────────────────────────────────────────
// Hay cuatro vocabularios de enum de dirección en los agentes; este primitivo
// los normaliza a {up, down, flat} para que el badge sea uniforme.
//   A4:    positivo | negativo | neutral
//   A3/Debate: alcista | bajista | lateral | neutral
//   A2:    risk_on | risk_off | neutral
//   A1:    oportunidad | vulnerabilidad | anomalia
export type RawDirection =
  | 'positivo' | 'negativo' | 'neutral'
  | 'alcista' | 'bajista' | 'lateral'
  | 'risk_on' | 'risk_off'
  | 'oportunidad' | 'vulnerabilidad' | 'anomalia'
  | (string & {}) | null | undefined;

type Dir = 'up' | 'down' | 'flat';

export function normalizeDirection(dir: RawDirection): Dir {
  switch (dir) {
    case 'positivo':
    case 'alcista':
    case 'risk_on':
    case 'oportunidad':
      return 'up';
    case 'negativo':
    case 'bajista':
    case 'risk_off':
    case 'vulnerabilidad':
      return 'down';
    default:
      // neutral, lateral, anomalia, null, desconocido → sin sesgo direccional
      return 'flat';
  }
}

export function DirectionBadge({ dir, className }: { dir: RawDirection; className?: string }) {
  const d = normalizeDirection(dir);
  const sym = d === 'up' ? '▲' : d === 'down' ? '▼' : '■';
  const cls = d === 'up' ? 'text-emerald' : d === 'down' ? 'text-rose' : 'text-slate';
  const label = d === 'up' ? 'alcista' : d === 'down' ? 'bajista' : 'neutral';
  return (
    <span
      className={cn('font-mono text-fluid-caption leading-none flex-shrink-0', cls, className)}
      role="img"
      aria-label={label}
    >
      {sym}
    </span>
  );
}

// ─── Confianza ─────────────────────────────────────────────────────────────
export type ConfidenceCategory = 'baja' | 'media' | 'alta';

/** Umbral documentado en types.ts: 0-33 baja · 34-66 media · 67-100 alta. */
export function confidenceCategory(value: number | ConfidenceCategory): ConfidenceCategory {
  if (typeof value === 'string') return value;
  if (value >= 67) return 'alta';
  if (value >= 34) return 'media';
  return 'baja';
}

export function ConfidenceChip({
  value,
  showBar = false,
  className,
}: {
  value: number | ConfidenceCategory;
  showBar?: boolean;
  className?: string;
}) {
  const cat = confidenceCategory(value);
  // % para la barra: si es número, el valor real; si es categoría, el centro del tramo.
  const pct = typeof value === 'number' ? value : cat === 'alta' ? 100 : cat === 'media' ? 66 : 33;
  const label = typeof value === 'number' ? `${value}%` : value;
  // FIREWALL: la confianza del agente NO es dato de mercado → intensidad de tinta
  // + accent, JAMÁS emerald/amber/rose. El acento aporta la "vivacidad" de alta.
  const tone = cat === 'alta' ? 'text-ink' : cat === 'media' ? 'text-ink/70' : 'text-ink/45';
  const fill = cat === 'alta' ? 'bg-accent' : cat === 'media' ? 'bg-accent/60' : 'bg-ink/30';
  return (
    <span className={cn('inline-flex items-center gap-1 flex-shrink-0', className)} title={`confianza ${label}`}>
      <span className={cn('h-1.5 w-1.5 rounded-full', fill)} />
      <span className={cn('font-mono text-fluid-caption font-medium tabular-nums uppercase tracking-wider', tone)}>
        {label}
      </span>
      {showBar && (
        <span className="h-1 w-8 overflow-hidden rounded-full bg-white/10">
          <span className={cn('block h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  );
}

// ─── Barra de segmentos (sustituye el texto "N/5") ───────────────────────────
export function SegmentBar({
  value,
  max = 5,
  className,
}: {
  value: number;
  max?: number;
  className?: string;
}) {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 flex-shrink-0', className)}
      role="img"
      aria-label={`${filled} de ${max}`}
    >
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={cn('h-2 w-1.5 rounded-[1px]', i < filled ? 'bg-white' : 'bg-white/15')} />
      ))}
    </span>
  );
}
