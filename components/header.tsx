import { cn } from '@/lib/utils';
import { UserMenu } from './user-menu';

type Status = 'offline' | 'running' | 'ok' | 'error';

interface HeaderProps {
  tagline?: string;
  status?: Status;
  showUser?: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  offline: 'OFFLINE',
  running: 'RUNNING',
  ok: 'OK',
  error: 'ERROR',
};

const STATUS_CLS: Record<Status, string> = {
  offline: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

export function Header({
  tagline = 'Anomaly Detection & Analysis Module',
  status = 'offline',
  showUser = true,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-surface/95 backdrop-blur-xl px-5 py-2.5">
      <div className="flex flex-col">
        <div className="font-orbitron text-lg font-black tracking-[0.18em] bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400 bg-clip-text text-transparent">
          A.D.A.M.
        </div>
        <div className="font-mono text-[8px] text-slate tracking-wider mt-px">{tagline}</div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'font-mono text-[9px] font-medium tracking-wider px-2.5 py-1 rounded border transition-all duration-300',
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
