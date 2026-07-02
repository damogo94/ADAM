'use client';

import { cn, getCurrencyFromTicker } from '@/lib/utils';
import { Glossed } from '@/components/lens/glossed';
import { RESOLVED_OUTCOMES, copyReport, type SignalWithOutcome } from '@/components/signals/helpers';
import { OutcomeBadge } from '@/components/signals/outcome';
import { KV, levelMeta } from '@/components/signals/primitives';

/**
 * SignalCard + GroupSection — extraídos de `app/signals/page.tsx` (F4) para que
 * la vista "histórico" del radar (watchlist) reutilice EXACTAMENTE la misma
 * tarjeta y agrupación que la pantalla de Señales, sin duplicar la lógica de
 * render. `signals/page.tsx` sigue vivo hasta F5 y ahora importa desde aquí.
 *
 * Sin cambios de comportamiento respecto al original: tarjeta colapsable con
 * outcome, niveles E/S/T, R/B, indicadores, invalidación, y acciones
 * (analizar · copiar reporte · marcar leído).
 */

// ── Grupo de la lista (en seguimiento / resueltas / no seguidas) ──────────────
export function GroupSection({
  label,
  count,
  muted,
  children,
}: {
  label: string;
  count: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-1 pb-1.5">
        <span
          className={cn(
            'font-mono text-[11px] font-medium uppercase tracking-[0.12em]',
            muted ? 'text-ink/66' : 'text-ink/70'
          )}
        >
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink/66">{count}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      <div className={cn('px-4 space-y-1.5', muted && 'opacity-75')}>{children}</div>
    </div>
  );
}

export function SignalCard({
  signal,
  expanded,
  onToggle,
  onAck,
  onAnalyze,
}: {
  signal: SignalWithOutcome;
  expanded: boolean;
  onToggle: () => void;
  onAck: () => void;
  onAnalyze: () => void;
}) {
  const meta = levelMeta(signal.level);
  const acknowledged = !!signal.acknowledged_at;
  const emitted = new Date(signal.emitted_at);
  const indicators = (signal.indicators ?? {}) as Record<string, string>;
  const ccy = getCurrencyFromTicker(signal.ticker);
  const out = signal.outcome;
  const isResolved = out != null && RESOLVED_OUTCOMES.has(out.outcome);
  const fmtPx = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : `${v} ${ccy}`;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card-sm border bg-surface-2 transition-all',
        acknowledged ? 'border-white/5 opacity-60' : 'border-white/10',
        meta.pulse && !acknowledged && 'animate-urg-pulse'
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', meta.band)} />
      <button onClick={onToggle} aria-expanded={expanded} className="block w-full px-3 pl-4 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[13px] font-bold tracking-wider text-ink">{signal.ticker}</span>
              <span className={cn('font-mono text-[11px] font-medium uppercase tracking-wider', meta.text)}>
                {meta.label}
              </span>
              <span className="rounded border border-white/15 bg-white/[0.03] px-1.5 py-px font-mono text-[12px] tracking-wider text-ink/70">
                {signal.timeframe}
              </span>
            </div>
            <div className="font-mono text-[12px] text-ink/66 mt-0.5 line-clamp-1">
              {signal.setup_detected}
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            {out && <OutcomeBadge outcome={out} />}
            <div className={cn('font-sans text-[14px] font-bold', meta.text)}>
              {signal.confidence_pct}%
            </div>
            <div className="font-mono text-[12px] text-ink/66">{emitted.toLocaleTimeString().slice(0, 5)}</div>
          </div>
          <span className="font-mono text-[14px] text-slate-l opacity-50">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 pl-4 py-2.5">
          {/* Resultado del trade (si ya se evaluó) */}
          {out && (
            <div className="mb-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink/66 mb-1">Resultado</div>
              {isResolved ? (
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <OutcomeBadge outcome={out} />
                  {out.r_multiple != null && (
                    <span className={cn('font-medium', out.r_multiple >= 0 ? 'text-emerald' : 'text-rose')}>
                      {out.r_multiple >= 0 ? '+' : ''}
                      {out.r_multiple.toFixed(2)}R
                    </span>
                  )}
                  {out.return_pct != null && (
                    <span className="text-ink/70">
                      {out.return_pct >= 0 ? '+' : ''}
                      {out.return_pct.toFixed(1)}%
                    </span>
                  )}
                  {out.resolved_days != null && (
                    <span className="text-ink/66">· {out.resolved_days}d hasta resolución</span>
                  )}
                </div>
              ) : (
                <div className="font-mono text-[11px] text-ink/66">
                  no evaluable — geometría de niveles degenerada (no se pudo inferir dirección).
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-2">
            <KV label={<><Glossed term="entrada">ENTRADA</Glossed> · {ccy}</>} value={fmtPx(signal.entry_price)} />
            <KV label={<><Glossed term="stop">▼ STOP</Glossed> · {ccy}</>} value={fmtPx(signal.stop_loss)} cls="text-rose" />
            <KV label={<><Glossed term="target">▲ TARGET</Glossed> · {ccy}</>} value={fmtPx(signal.target_price)} cls="text-emerald" />
          </div>
          <KV label={<Glossed term="rb">R/B</Glossed>} value={signal.risk_reward_ratio?.toFixed(2) ?? '—'} cls="text-amber" />

          {Object.keys(indicators).length > 0 && (
            <div className="mt-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink/66 mb-1">Indicadores</div>
              <div className="space-y-1">
                {Object.entries(indicators).map(([k, v]) => (
                  <div key={k} className="font-mono text-[12px]">
                    <span className="text-ink/66">{k}: </span>
                    <span className="text-ink">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 border-t border-white/5 pt-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-rose mb-0.5">Invalida si</div>
            <div className="font-mono text-[12px] text-ink/90">{signal.invalidation_factor}</div>
          </div>

          {/* Puente al análisis completo del ticker — antes una señal era un
              dead-end (solo copiar/marcar leído). accent = navegación de marca. */}
          <button
            onClick={onAnalyze}
            className="mt-3 w-full rounded-lg border border-accent/40 bg-accent/[0.06] px-2 py-3 font-mono text-[11px] text-accent transition hover:bg-accent/[0.12] hover:border-accent/60"
          >
            analizar {signal.ticker} ▶
          </button>

          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={() => copyReport(signal, meta, ccy)}
              className="flex-1 rounded-lg border border-white/10 px-2 py-3 font-mono text-[11px] text-ink/66 hover:border-white/35 hover:text-ink transition"
            >
              copiar reporte
            </button>
            {!acknowledged && (
              <button
                onClick={onAck}
                className="flex-1 rounded-lg border border-emerald/25 bg-emerald/[0.04] px-2 py-3 font-mono text-[11px] text-emerald hover:bg-emerald/[0.08] hover:border-emerald/40 transition"
              >
                marcar leído
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
