'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// Diferenciación de agentes = TIPOGRÁFICA (badge + posición), no cromática. Los
// tokens a1..a4 ya = ink, así que las 4 variantes cromáticas viejas colapsan a
// `ink`; `slate` se conserva como "neutro secundario" (A4 · Estructura).
export type AgentAccent = 'ink' | 'slate';
export type AgentStatus = 'idle' | 'scanning' | 'done' | 'anomaly' | 'error' | 'live';

const ACCENT_BG: Record<AgentAccent, string> = {
  ink: 'bg-gradient-to-br from-ink/10 to-ink/[0.04]',
  slate: 'bg-black/20',
};

const ACCENT_BADGE: Record<AgentAccent, string> = {
  ink: 'bg-ink/15 text-ink',
  slate: 'bg-slate/20 text-slate-l',
};

const ACCENT_SCAN: Record<AgentAccent, string> = {
  ink: 'border-ink/30',
  slate: 'border-slate/30',
};

// NOTA: el readout del estado scanning es `ScanSteps` — una checklist estática
// y HONESTA de lo que el agente computa (sin tareas rotando en un timer falso;
// el carrusel teatral se retiró al pasar /run a streaming). El progreso real lo
// da el stream NDJSON: la card flipea a contenido en cuanto su agente aterriza.
// Sobre la card se superpone una fina línea `animate-sweep` en `accent` (chrome
// ambiental) que la ata al lenguaje visual del ConfluenceHero — decoración PURA:
// no afirma progreso ni completado; el ✓/done viven solo en StatusDot, derivado
// del AgentStatus real. `motion-reduce:hidden` la oculta.

interface AgentCardShellProps {
  accent?: AgentAccent;
  badge: string;
  title: string;
  status: AgentStatus;
  source?: string;
  dashed?: boolean;
  /** Subtítulo bajo el header (ej. para A3 el comando del usuario) */
  subline?: string;
  /**
   * Fila-veredicto SIEMPRE visible cuando hay datos (rediseño verdict-first).
   * Debe incluir dirección + titular + confianza. Si se pasa, la card es
   * COLAPSABLE: el cuerpo (`children`) solo aparece al expandir. Si se omite
   * (idle/scanning/error), la card se comporta como antes (cuerpo siempre visible).
   */
  summary?: React.ReactNode;
  /** Abrir expandido por defecto (ej. auto-open cuando hay señal). Default: false. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AgentCardShell({
  accent = 'ink',
  badge,
  title,
  status,
  source,
  dashed,
  subline,
  summary,
  defaultOpen = false,
  children,
}: AgentCardShellProps) {
  const isScanning = status === 'scanning';
  const collapsible = summary != null;
  const [open, setOpen] = useState(defaultOpen);

  const cardCls = cn(
    'relative overflow-hidden rounded-[15px] border bg-surface-2 transition-[border-color,box-shadow] duration-300',
    dashed ? 'border-dashed' : 'border-solid',
    isScanning ? ACCENT_SCAN[accent] : 'border-white/5'
  );

  const badgeEl = (
    <span
      className={cn(
        'font-sans text-[12px] font-bold tracking-wider rounded px-1.5 py-0.5 flex-shrink-0',
        ACCENT_BADGE[accent]
      )}
    >
      {badge}
    </span>
  );

  // ── Modo legacy (sin summary): header estático + cuerpo siempre visible ──
  // Lo usan los estados idle / scanning / error, que deben mostrar su
  // contenido (standby, carrusel, mensaje de error) sin colapsar.
  if (!collapsible) {
    return (
      <div className={cardCls}>
        {/* Línea de barrido ambiental — chrome accent atado al ConfluenceHero.
            Solo en scanning; decoración pura (no afirma nada). reduced-motion la oculta. */}
        {isScanning && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-10 h-px bg-accent/40 animate-sweep motion-reduce:hidden"
          />
        )}
        <header
          className={cn('flex items-center gap-1.5 border-b border-white/5 px-2.5 py-2', ACCENT_BG[accent])}
        >
          {badgeEl}
          <span className="flex-1 font-mono text-[12px] font-medium text-white">{title}</span>
          {source && <span className="font-mono text-[12px] text-white/66 flex-shrink-0">{source}</span>}
          <StatusDot status={status} />
        </header>
        {subline && (
          <div className="px-2.5 pt-0.5 pb-1 font-mono text-[12px] tracking-tight text-a3/50">{subline}</div>
        )}
        <div className="min-h-[90px] p-2.5">{children}</div>
      </div>
    );
  }

  // ── Modo colapsable (con summary): la fila-veredicto es el toggle ────────
  return (
    <div className={cardCls}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-1.5 px-2.5 py-2 text-left min-h-[44px] transition-colors',
          ACCENT_BG[accent],
          open ? 'border-b border-white/5' : 'border-b border-transparent'
        )}
      >
        {badgeEl}
        <span className="flex min-w-0 flex-1 items-center gap-1.5">{summary}</span>
        <StatusDot status={status} />
        <span
          className={cn(
            'font-mono text-[12px] leading-none text-white/66 transition-transform duration-200 flex-shrink-0',
            open && 'rotate-90'
          )}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      {open && (
        <>
          {(title || source) && (
            <div className="flex items-center gap-1 px-2.5 pt-1.5 font-mono text-[11px] uppercase tracking-wider text-white/66">
              <span className="font-medium text-white/70">{title}</span>
              {source && <span className="opacity-80">· {source}</span>}
            </div>
          )}
          {subline && (
            <div className="px-2.5 pt-0.5 font-mono text-[12px] tracking-tight text-a3/50">{subline}</div>
          )}
          <div className="p-2.5 pt-1.5">{children}</div>
        </>
      )}
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
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-blink-slow" />
        <span className="font-mono text-[12px] font-medium text-white tracking-wider">LIVE</span>
      </div>
    );
  }
  // Estado del agente = chrome → diferenciación por INTENSIDAD + MOVIMIENTO,
  // no por color de mercado (emerald/rose/amber reservados a datos).
  const cls =
    status === 'idle'
      ? 'bg-white/30'
      : status === 'scanning'
        ? 'bg-white animate-blink'
        : status === 'done'
          ? 'bg-white'
          : status === 'anomaly'
            ? 'bg-white animate-blink'
            : status === 'error'
              ? 'bg-white animate-blink-slow'
              : 'bg-white/30';
  return <span className={cn('h-1.5 w-1.5 rounded-full transition-all flex-shrink-0', cls)} />;
}

export function IdleState({ label = 'standby' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-4">
      <div className="text-xl text-white/15">◎</div>
      <div className="font-mono text-[11px] tracking-wider text-white/66">{label}</div>
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
            'flex items-start gap-1.5 py-px font-mono text-[12px]',
            s.done ? 'text-white/75' : 'text-white/66'
          )}
        >
          <span className={cn('w-2.5 flex-shrink-0 text-[12px]', s.done && 'text-white')}>
            {s.done ? '✓' : '—'}
          </span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
