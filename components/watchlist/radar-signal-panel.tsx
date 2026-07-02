'use client';

import { useState } from 'react';
import { cn, getCurrencyFromTicker } from '@/lib/utils';
import { Glossed } from '@/components/lens/glossed';
import { outcomeMeta } from '@/components/signals/outcome';
import { RESOLVED_OUTCOMES } from '@/components/signals/helpers';
import type { RadarSignal_t, RadarSignalOutcome_t } from '@/lib/radar/types';

/**
 * RadarSignalPanel — bloque 5 de la fila del radar (señal CMT activa), ahora
 * COLAPSABLE (F4). Antes era estático; ahora el header muestra el resumen
 * compacto (nivel · setup · confianza) y al hacer click se expande para mostrar
 * el detalle accionable + acciones (marcar leído · copiar reporte).
 *
 * Densidad móvil: el contenedor de la fila ya es `max-w-md`; este panel hereda.
 * `prefers-reduced-motion`: el chevron y la altura NO se animan bajo
 * `motion-reduce` (usamos `motion-reduce:transition-none` en la transición).
 *
 * DESAJUSTE DE TIPOS (documentado): el radar trae `RadarSignal_t`, un SUBSET de
 * `signals_history` (id·level·timeframe·setup·confidence·emitted_at·outcome). NO
 * carga entry/stop/target/R-B/invalidación/indicadores (esos NO están en el
 * contrato `RadarSignal_t` — solo en la tabla completa que consume /signals).
 * Por eso el panel muestra lo disponible y, para el detalle de niveles, remite
 * al histórico (`GET /api/signals`) / al análisis. El outcome usa
 * `RadarSignalOutcome_t` (no `SignalTradeOutcome`), así que reutilizamos
 * `outcomeMeta()` vía un `RadarOutcomeBadge` local en vez de `OutcomeBadge`
 * (que exige el Row completo) — sin duplicar `outcomeMeta`.
 */

interface RadarSignalPanelProps {
  signal: RadarSignal_t;
  ticker: string;
  /** Marcar la señal como leída (ack optimista, lo maneja la page). */
  onAck: () => void;
}

/** Meta de color por nivel de la señal (rose/amber/emerald · semántico). */
function levelChrome(level: RadarSignal_t['level']) {
  if (level === 'urgente') return { border: 'border-rose/35 bg-rose/[0.06]', text: 'text-rose' };
  if (level === 'atencion') return { border: 'border-amber/30 bg-amber/[0.05]', text: 'text-amber' };
  if (level === 'monitorear') return { border: 'border-emerald/25 bg-emerald/[0.03]', text: 'text-emerald' };
  return { border: 'border-white/10 bg-white/[0.02]', text: 'text-ink/66' };
}

export function RadarSignalPanel({ signal, ticker, onAck }: RadarSignalPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const chrome = levelChrome(signal.level);
  const ccy = getCurrencyFromTicker(ticker);

  function onCopy() {
    // El radar no carga E/S/T/R-B/invalidación (no están en RadarSignal_t), así
    // que copiamos el resumen disponible. El reporte completo vive en /signals.
    const lines = [
      `${ticker} · CMT ${signal.level} · ${signal.timeframe}`,
      `Confianza: ${signal.confidence_pct}%`,
      `Setup: ${signal.setup_detected}`,
      `Emitida: ${new Date(signal.emitted_at).toLocaleString()}`,
    ];
    if (signal.outcome) {
      const o = signal.outcome;
      const om = outcomeMeta(o.outcome);
      const parts = [`Resultado: ${om.label}`];
      if (o.r_multiple != null) parts.push(`${o.r_multiple >= 0 ? '+' : ''}${o.r_multiple.toFixed(2)}R`);
      if (o.return_pct != null) parts.push(`${o.return_pct >= 0 ? '+' : ''}${o.return_pct.toFixed(1)}%`);
      lines.push(parts.join(' · '));
    }
    void navigator.clipboard.writeText(lines.join('\n'));
  }

  return (
    <div className={cn('mx-3 mb-2 rounded-md border', chrome.border)}>
      {/* Header compacto — resumen de la señal (siempre visible). */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Colapsar' : 'Expandir'} señal CMT de ${ticker}`}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
      >
        <Glossed term="cmt">
          <span className={cn('font-sans text-[12px] font-bold uppercase tracking-wider', chrome.text)}>
            CMT · {signal.level}
          </span>
        </Glossed>
        <span className="flex-1 truncate font-mono text-[12px] text-ink/80">{signal.setup_detected}</span>
        {signal.outcome && <RadarOutcomeBadge outcome={signal.outcome} />}
        <span className="font-mono text-[12px] text-ink/66">{signal.confidence_pct}%</span>
        <span
          aria-hidden
          className={cn(
            'font-mono text-[12px] text-slate-l opacity-60 transition-transform duration-200 motion-reduce:transition-none',
            expanded && 'rotate-90'
          )}
        >
          ▸
        </span>
      </button>

      {/* Detalle expandido. */}
      {expanded && (
        <div className="border-t border-white/5 px-2 py-2">
          {/* Outcome ±R si está resuelto (RadarSignalOutcome_t). */}
          {signal.outcome && <OutcomeDetail outcome={signal.outcome} />}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[12px]">
            <MetaRow label="Temporalidad" value={signal.timeframe} />
            <MetaRow label="Confianza" value={`${signal.confidence_pct}%`} />
            <MetaRow
              label="Emitida"
              value={new Date(signal.emitted_at).toLocaleString()}
              className="col-span-2"
            />
          </dl>

          {/* Los niveles E/S/T + R/B + invalidación e indicadores no viajan en el
              contrato del radar (RadarSignal_t). Puente honesto al detalle. */}
          <p className="mt-2 font-mono text-[11px] leading-snug text-ink/66">
            Niveles de entrada/stop/target · <span className="text-ink/45">{ccy}</span> · R/B e
            indicadores en el histórico completo (▾ ver histórico) o al analizar el activo.
          </p>

          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 rounded-lg border border-white/10 px-2 py-2.5 font-mono text-[11px] text-ink/66 transition hover:border-white/35 hover:text-ink"
            >
              copiar reporte
            </button>
            <button
              type="button"
              onClick={onAck}
              className="flex-1 rounded-lg border border-emerald/25 bg-emerald/[0.04] px-2 py-2.5 font-mono text-[11px] text-emerald transition hover:border-emerald/40 hover:bg-emerald/[0.08]"
            >
              marcar leído
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function MetaRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="font-mono text-[11px] uppercase tracking-wider text-ink/66">{label}</dt>
      <dd className="mt-0.5 truncate text-ink">{value}</dd>
    </div>
  );
}

/**
 * RadarOutcomeBadge — equivalente de `OutcomeBadge` para el radar. `OutcomeBadge`
 * exige `SignalTradeOutcome` (Row completo con signal_id/evaluated_at/…), pero el
 * radar solo trae `RadarSignalOutcome_t`. Reusamos `outcomeMeta()` (SSOT de color)
 * y `RESOLVED_OUTCOMES` — cero duplicación de la lógica de mapeo.
 */
export function RadarOutcomeBadge({ outcome }: { outcome: RadarSignalOutcome_t }) {
  const m = outcomeMeta(outcome.outcome);
  const showR =
    RESOLVED_OUTCOMES.has(outcome.outcome) &&
    outcome.outcome !== 'no_fill' &&
    outcome.r_multiple != null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-wider',
        m.cls
      )}
    >
      {m.label}
      {showR && (
        <span className="tabular-nums opacity-90">
          {outcome.r_multiple! >= 0 ? '+' : ''}
          {outcome.r_multiple!.toFixed(1)}R
        </span>
      )}
    </span>
  );
}

/** Detalle del outcome (±R · retorno · días) cuando la señal ya se resolvió. */
function OutcomeDetail({ outcome }: { outcome: RadarSignalOutcome_t }) {
  const isResolved = RESOLVED_OUTCOMES.has(outcome.outcome);
  return (
    <div className="mb-2">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink/66">Resultado</div>
      {isResolved ? (
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <RadarOutcomeBadge outcome={outcome} />
          {outcome.r_multiple != null && (
            <span className={cn('font-medium', outcome.r_multiple >= 0 ? 'text-emerald' : 'text-rose')}>
              {outcome.r_multiple >= 0 ? '+' : ''}
              {outcome.r_multiple.toFixed(2)}R
            </span>
          )}
          {outcome.return_pct != null && (
            <span className="text-ink/70">
              {outcome.return_pct >= 0 ? '+' : ''}
              {outcome.return_pct.toFixed(1)}%
            </span>
          )}
          {outcome.resolved_days != null && (
            <span className="text-ink/66">· {outcome.resolved_days}d hasta resolución</span>
          )}
        </div>
      ) : (
        <div className="font-mono text-[11px] text-ink/66">
          en seguimiento — aún sin resolver a target/stop.
        </div>
      )}
    </div>
  );
}
