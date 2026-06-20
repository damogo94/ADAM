import { cn } from '@/lib/utils';
import { UserMenu } from './user-menu';

type Status = 'offline' | 'running' | 'ok' | 'error';

interface HeaderProps {
  tagline?: string;
  status?: Status;
  showUser?: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  // 'offline' = estado IDLE (sin análisis), NO un fallo. "EN ESPERA" lo comunica
  // sin que se lea como "roto".
  offline: 'EN ESPERA',
  running: 'RUNNING',
  ok: 'OK',
  error: 'ERROR',
};

/**
 * Status como INTENSIDAD de blanco, no color.
 * - offline   = neutro dim (en espera, sin análisis)
 * - running   = blink animation a 100%
 * - ok        = blanco firme (90%)
 * - error     = stroke marcado + slight pulse
 */
const STATUS_CLS: Record<Status, string> = {
  offline: 'bg-white/[0.04] text-white/66 border-white/10',
  running: 'bg-white/[0.06] text-white/80 border-white/20 animate-blink-slow',
  ok: 'bg-white/[0.06] text-white/90 border-white/25',
  error: 'bg-white/[0.10] text-white border-white/40 animate-urg-pulse',
};

export function Header({
  tagline = 'Anomaly Detection & Analysis Module',
  status = 'offline',
  showUser = true,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-void/95 backdrop-blur-xl px-5 py-2.5">
      <div className="flex flex-col">
        <div className="font-orbitron text-lg font-black tracking-[0.18em] text-white">
          A.D.A.M.
        </div>
        <div className="font-mono text-[12px] tracking-wider text-white/66 mt-px">{tagline}</div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'font-mono text-[11px] font-medium tracking-wider px-2.5 py-1 rounded border transition-all duration-300',
            STATUS_CLS[status]
          )}
        >
          {STATUS_LABEL[status]}
        </span>
        {showUser && <UserMenu />}
      </div>
    </header>
  );
}
