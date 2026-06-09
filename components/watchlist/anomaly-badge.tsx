import { cn } from '@/lib/utils';
import type { RadarAnomalyType_t } from '@/lib/radar/types';

/**
 * Badge de anomalía detectada por A1.
 *
 * Decisión G de FASE 0: mostrar SIEMPRE que A1.anomaly_detected = true,
 * diferenciado por `anomaly_type`:
 *   - ▲ oportunidad     (emerald)
 *   - ▼ vulnerabilidad  (rose)
 *   - ◆ anomalía genérica (amber)
 *
 * Las tres son señales — el user decide qué hacer con cada una.
 *
 * El `description` se renderiza como tooltip nativo (title) — en Fase 3
 * podemos envolver con un Tooltip estilado si lo añadimos al sistema.
 */

interface AnomalyBadgeProps {
  type: RadarAnomalyType_t | null;
  description?: string | null;
  /** Si true, fuerza la presencia del badge incluso cuando type es null
   *  (caso edge: A1 detecta anomalía pero no asigna type). */
  detected?: boolean;
}

export function AnomalyBadge({ type, description, detected }: AnomalyBadgeProps) {
  if (!type && !detected) return null;

  const t = type ?? 'anomalia';
  const meta =
    t === 'oportunidad'
      ? { icon: '▲', label: 'OPORTUNIDAD', cls: 'border-emerald/40 bg-emerald/[0.08] text-emerald' }
      : t === 'vulnerabilidad'
        ? { icon: '▼', label: 'VULNERABILIDAD', cls: 'border-rose/40 bg-rose/[0.08] text-rose' }
        : { icon: '◆', label: 'ANOMALÍA', cls: 'border-amber/40 bg-amber/[0.08] text-amber' };

  return (
    <span
      title={description ?? meta.label}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
        'font-mono text-[11px] font-bold uppercase tracking-wider',
        meta.cls
      )}
      aria-label={`Anomalía A1: ${meta.label}${description ? `. ${description}` : ''}`}
    >
      <span aria-hidden="true" className="text-[11px] leading-none">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
    </span>
  );
}
