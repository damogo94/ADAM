import { cn } from '@/lib/utils';

export type AgentAccent = 'blue' | 'cyan' | 'amber' | 'violet' | 'slate';
export type AgentStatus = 'idle' | 'scanning' | 'done' | 'anomaly' | 'error' | 'live';

const ACCENT_BG: Record<AgentAccent, string> = {
  blue: 'bg-gradient-to-br from-a1/10 to-a1/[0.04]',
  cyan: 'bg-gradient-to-br from-a2/[0.09] to-a2/[0.03]',
  amber: 'bg-gradient-to-br from-a3/10 to-a3/[0.03]',
  violet: 'bg-gradient-to-br from-a4/[0.09] to-a4/[0.03]',
  slate: 'bg-black/20',
};

const ACCENT_BADGE: Record<AgentAccent, string> = {
  blue: 'bg-a1/15 text-a1',
  cyan: 'bg-a2/[0.12] text-a2',
  amber: 'bg-a3/[0.14] text-a3',
  violet: 'bg-a4/[0.14] text-a4',
  slate: 'bg-slate/20 text-slate-l',
};

const ACCENT_SCAN: Record<AgentAccent, string> = {
  blue: 'border-a1/30',
  cyan: 'border-a2/25',
  amber: 'border-a3/30',
  violet: 'border-a4/25',
  slate: 'border-slate/30',
};

const ACCENT_SWEEP: Record<AgentAccent, string> = {
  blue: 'via-a1',
  cyan: 'via-a2',
  amber: 'via-a3',
  violet: 'via-a4',
  slate: 'via-slate-l',
};

interface AgentCardShellProps {
  accent: AgentAccent;
  badge: string;
  title: string;
  status: AgentStatus;
  source?: string;
  dashed?: boolean;
  /** Subtítulo bajo el header (ej. para A3 el comando del usuario) */
  subline?: string;
  children: React.ReactNode;
}

export function AgentCardShell({
  accent,
  badge,
  title,
  status,
  source,
  dashed,
  subline,
  children,
}: AgentCardShellProps) {
  const isScanning = status === 'scanning';
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[15px] border bg-surface-2 transition-[border-color,box-shadow] duration-300',
        dashed ? 'border-dashed' : 'border-solid',
        isScanning ? ACCENT_SCAN[accent] : 'border-white/5'
      )}
    >
      {/* sweep animation when scanning */}
      {isScanning && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 z-[5] h-px bg-gradient-to-r from-transparent to-transparent animate-sweep',
            ACCENT_SWEEP[accent]
          )}
        />
      )}

      <header className={cn('flex items-center gap-1.5 border-b border-white/5 px-2.5 py-2', ACCENT_BG[accent])}>
        <span className={cn('font-orbitron text-[8px] font-bold tracking-wider rounded px-1.5 py-0.5 flex-shrink-0', ACCENT_BADGE[accent])}>
          {badge}
        </span>
        <span className="flex-1 font-mono text-[10px] font-medium text-white">{title}</span>
        {source && <span className="font-mono text-[7px] text-slate flex-shrink-0">{source}</span>}
        <StatusDot status={status} />
      </header>

      {subline && (
        <div className="px-2.5 pt-0.5 pb-1 font-mono text-[8px] tracking-tight text-a3/50">{subline}</div>
      )}

      <div className="min-h-[90px] p-2.5">{children}</div>
    </div>
  );
}

/**
 * StatusDot — re-skin B&W.
 * Diferenciación por intensidad + animación (no color).
 *   - live      → dot blanco + texto "LIVE" + blink slow
 *   - scanning  → dot blanco + animate-blink (más rápido)
 *   - anomaly   → dot blanco + animate-blink (mismo que scanning visualmente;
 *                  la palabra "anomalía" en el cuerpo del card lo diferencia)
 *   - done      → dot blanco firme
 *   - error     → dot blanco + urg-pulse
 *   - idle      → dot blanco/30 estático (dim)
 */
function StatusDot({ status }: { status: AgentStatus }) {
  if (status === 'live') {
    return (
      <div className="flex items-center gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink-slow" />
        <span className="font-mono text-[8px] font-medium text-white tracking-wider">LIVE</span>
      </div>
    );
  }
  const cls =
    status === 'idle'
      ? 'bg-white/30'
      : status === 'scanning'
        ? 'bg-white animate-blink'
        : status === 'done'
          ? 'bg-emerald'
          : status === 'anomaly'
            ? 'bg-amber animate-blink'
            : status === 'error'
              ? 'bg-rose animate-urg-pulse'
              : 'bg-white/30';
  return <span className={cn('h-1.5 w-1.5 rounded-full transition-all', cls)} />;
}

export function IdleState({ label = 'standby' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-4">
      <div className="text-xl text-white/10">◎</div>
      <div className="font-mono text-[9px] tracking-wider text-white/40">{label}</div>
    </div>
  );
}

export function ScanSteps({ steps }: { steps: { label: string; done: boolean }[] }) {
  return (
    <div className="flex flex-col gap-1">
      {steps.map((s, i) => (
        <div
          key={i}
          className={cn(
            'flex items-start gap-1.5 py-px font-mono text-[9px]',
            s.done ? 'text-white/75' : 'text-white/45'
          )}
        >
          <span className={cn('w-2.5 flex-shrink-0 text-[8px]', s.done && 'text-white')}>
            {s.done ? '✓' : '—'}
          </span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
