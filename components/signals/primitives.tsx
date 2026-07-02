import { cn } from '@/lib/utils';
import type { SignalLevel } from '@/types/db';

export function CountBox({ label, value, tone }: { label: string; value: number; tone: SignalLevel }) {
  // Sesión 5b: color semántico back. La urgencia se comunica por COLOR
  // (rose>amber>emerald) + ANIMACIÓN (solo urgente pulsa cuando hay >0).
  // Cuando count=0, el box queda dim — el ojo no se distrae con ceros.
  const active = value > 0;
  const cls =
    tone === 'urgente'
      ? active
        ? 'text-rose border-rose/45 bg-rose/[0.10] animate-urg-pulse'
        : 'text-rose/30 border-rose/12 bg-rose/[0.02]'
      : tone === 'atencion'
        ? active
          ? 'text-amber border-amber/45 bg-amber/[0.08]'
          : 'text-amber/30 border-amber/12 bg-amber/[0.02]'
        : active
          ? 'text-emerald border-emerald/40 bg-emerald/[0.07]'
          : 'text-emerald/30 border-emerald/12 bg-emerald/[0.02]';
  return (
    <div className={cn('rounded-card-sm border px-2 py-2.5 text-center transition-all', cls)}>
      <div className="font-mono text-[20px] font-black">{value}</div>
      <div className="font-mono text-[11px] tracking-wider opacity-80 mt-0.5">{label}</div>
    </div>
  );
}

export function KV({ label, value, cls }: { label: React.ReactNode; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-3">
      <div className="font-mono text-[11px] uppercase tracking-wider text-ink/66 mb-0.5">{label}</div>
      <div className={cn('font-mono text-[11px] font-medium text-ink', cls)}>{value}</div>
    </div>
  );
}

/**
 * levelMeta — color semántico por nivel de urgencia.
 *   urgente    → rose pulsing  (acción inmediata)
 *   atencion   → amber         (1-3 sesiones de seguimiento)
 *   monitorear → emerald       (en el radar, sin trigger)
 *   sin_senal  → slate         (ruido, no operar)
 */
export function levelMeta(level: SignalLevel) {
  if (level === 'urgente') return { band: 'bg-rose', text: 'text-rose', label: 'URGENTE', pulse: true };
  if (level === 'atencion') return { band: 'bg-amber', text: 'text-amber', label: 'ATENCIÓN', pulse: false };
  if (level === 'monitorear') return { band: 'bg-emerald', text: 'text-emerald', label: 'MONITOREAR', pulse: false };
  return { band: 'bg-white/20', text: 'text-ink/66', label: 'SIN SEÑAL', pulse: false };
}
