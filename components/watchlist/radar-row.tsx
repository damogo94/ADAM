'use client';

import { cn, fmtPct, getCurrencyFromTicker } from '@/lib/utils';
import { AnomalyBadge } from './anomaly-badge';
import { DictamenSparkline } from './dictamen-sparkline';
import { PinButton } from './pin-button';
import { Glossed } from '@/components/lens/glossed';
import type { RadarRow_t } from '@/lib/radar/types';

/**
 * Fila del Watchlist Radar — densa, accionable, sin gráfico (el gráfico
 * vive en /analysis para deep-dive).
 *
 * Layout vertical en bloques:
 *   1. Cabecera: ticker · asset_type · precio + cambio 24h · botón ▶ analizar
 *   2. Headline A4 (una sola frase) + AnomalyBadge si A1 marcó algo
 *   3. Dictamen + DELTA + FRESCURA
 *   4. DISTANCIA A LA ACCIÓN (si hay setup A3) — entrada/stop/target/RB
 *   5. Signal CMT activa (si la hay) — bordeada por severity
 *
 * Reglas spec:
 *   - is_stale → confluencia degradada visualmente (no como "live").
 *   - Click en la fila NO navega (regla previa). El ▶ es el botón explícito.
 *   - Cero layout shift: bloques siempre presentes con placeholders.
 */

interface RadarRowProps {
  row: RadarRow_t;
  /** Cierres de sparkline (rango decidido por la page). [] mientras carga. */
  sparklineCloses?: number[];
  onAnalyze: () => void;
  onDelete: () => void;
  /** Pin/unpin del item. */
  onTogglePin: () => void;
  /** Highlight visual cuando el digest seleccionó este ticker. */
  highlighted?: boolean;
}

export function RadarRow({
  row,
  sparklineCloses,
  onAnalyze,
  onDelete,
  onTogglePin,
  highlighted,
}: RadarRowProps) {
  const { ticker, asset_type, quote, latest, delta, distances, signal, is_stale, is_pinned } = row;
  const currency = quote?.currency ?? getCurrencyFromTicker(ticker);
  const pos = (quote?.change_pct_24h ?? 0) >= 0;
  const hasAnalysis = latest !== null;

  return (
    <div
      data-ticker={ticker}
      className={cn(
        'group relative rounded-[15px] border bg-surface-2 transition-all duration-300',
        highlighted
          ? 'border-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]'
          : 'border-white/8 hover:border-white/25',
        is_stale && 'opacity-90'
      )}
    >
      {/* ───── 1. Cabecera ───── */}
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {is_pinned && (
              <span
                className="font-mono text-[10px] leading-none text-white/65"
                aria-label="Fijado"
                title="Fijado"
              >
                ◆
              </span>
            )}
            <span className="font-orbitron text-[13px] font-bold tracking-wider text-white">
              {ticker}
            </span>
            <span className="font-mono text-[8px] uppercase tracking-wider text-slate">
              {asset_type}
            </span>
          </div>
        </div>

        {/* Sparkline — coherente con dictamen A4, NO con la pendiente
            de la serie. Si no hay valores, renderiza placeholder discreto. */}
        <DictamenSparkline
          values={sparklineCloses ?? []}
          direction={latest?.direction ?? null}
          stale={is_stale}
        />

        <div className="text-right">
          {quote ? (
            <>
              <div className="font-mono text-[13px] font-medium text-white">
                {quote.current.toFixed(2)}
                <span className="ml-1 text-[10px] text-white/45">{currency}</span>
              </div>
              <div className={cn('font-mono text-[10px]', pos ? 'text-emerald' : 'text-rose')}>
                {pos ? '↑ ' : '↓ '}
                {fmtPct(quote.change_pct_24h)}
              </div>
            </>
          ) : (
            <span className="font-mono text-[10px] text-slate">no quote</span>
          )}
        </div>

        <button
          onClick={onAnalyze}
          aria-label={`Analizar ${ticker}`}
          title="Analizar"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] font-mono text-[12px] text-white/55 transition hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
        >
          ▶
        </button>

        <PinButton pinned={is_pinned} onToggle={onTogglePin} />
      </div>

      {/* ───── 2. Headline + AnomalyBadge ───── */}
      <div className="px-3 pt-1.5">
        {hasAnalysis ? (
          <div className="flex items-start gap-2">
            <p className="flex-1 font-mono text-[10px] leading-snug text-white/75 line-clamp-2">
              {latest!.headline}
            </p>
            {latest!.a1_anomaly_detected && (
              <AnomalyBadge
                type={latest!.a1_anomaly_type}
                description={latest!.a1_anomaly_description}
                detected
              />
            )}
          </div>
        ) : (
          <p className="font-mono text-[10px] text-white/35 italic">
            sin análisis previo · ejecuta uno con ▶
          </p>
        )}
      </div>

      {/* ───── 3. Dictamen + DELTA + FRESCURA ───── */}
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/5 px-3 py-2">
        {/* Dictamen + confluencia */}
        <DataCell label={<Glossed term="dictamen">Dictamen</Glossed>}>
          {hasAnalysis ? (
            <span className="flex items-baseline gap-1.5">
              <DirectionGlyph direction={latest!.direction} />
              <Glossed term="confluencia">
                <span
                  className={cn(
                    'font-orbitron text-[12px] font-bold',
                    is_stale ? 'text-white/45' : 'text-white'
                  )}
                >
                  {latest!.confluence_pct}%
                </span>
              </Glossed>
              {is_stale && (
                <Glossed term="stale">
                  <span
                    className="font-mono text-[7px] uppercase tracking-wider text-amber/80"
                    title="Análisis con más de 24h. Vuelve a correrlo para refresh."
                  >
                    stale
                  </span>
                </Glossed>
              )}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-white/30">—</span>
          )}
        </DataCell>

        {/* Delta */}
        <DataCell label="Delta">
          <DeltaCell delta={delta} />
        </DataCell>

        {/* Frescura */}
        <DataCell label="Frescura">
          {hasAnalysis ? (
            <span
              className={cn(
                'font-mono text-[10px]',
                is_stale ? 'text-amber/80' : 'text-white/65'
              )}
              title={new Date(latest!.created_at).toLocaleString()}
            >
              {timeAgo(latest!.created_at)}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-white/30">—</span>
          )}
        </DataCell>
      </div>

      {/* ───── 4. Distancia a la acción ───── */}
      {hasAnalysis && distances && latest!.a3_signal && latest!.a3_signal !== 'hold' && (
        <div
          className={cn(
            'mx-3 mb-2 rounded-md border px-2 py-1.5',
            distances.actionable
              ? 'border-emerald/30 bg-emerald/[0.04]'
              : 'border-white/8 bg-white/[0.02]'
          )}
        >
          <div className="mb-1 flex items-baseline justify-between">
            <span className="font-mono text-[8px] uppercase tracking-wider text-white/45">
              <Glossed term={distances.actionable ? 'accionable' : 'accionable'}>
                {distances.actionable ? 'accionable ahora' : 'en radar'}
              </Glossed>{' '}
              · {latest!.a3_signal === 'buy' ? 'LONG' : 'SHORT'}
            </span>
            {distances.risk_reward !== null && (
              <Glossed term="rb">
                <span className="font-mono text-[9px] text-amber">
                  R/B {distances.risk_reward.toFixed(2)}
                </span>
              </Glossed>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
            <DistanceBlock label="Entrada" term="entrada" pct={distances.to_entry_pct} accent="text-white" />
            <DistanceBlock label="Stop" term="stop" pct={distances.to_stop_pct} accent="text-rose" />
            <DistanceBlock label="Target" term="target" pct={distances.to_target_pct} accent="text-emerald" />
          </div>
        </div>
      )}

      {/* ───── 5. Signal CMT activa ───── */}
      {signal && (
        <div
          className={cn(
            'mx-3 mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5',
            signal.level === 'urgente'
              ? 'border-rose/35 bg-rose/[0.06]'
              : signal.level === 'atencion'
                ? 'border-amber/30 bg-amber/[0.05]'
                : 'border-emerald/25 bg-emerald/[0.03]'
          )}
        >
          <Glossed term="cmt">
            <span
              className={cn(
                'font-orbitron text-[8px] font-bold uppercase tracking-wider',
                signal.level === 'urgente'
                  ? 'text-rose'
                  : signal.level === 'atencion'
                    ? 'text-amber'
                    : 'text-emerald'
              )}
            >
              CMT · {signal.level}
            </span>
          </Glossed>
          <span className="flex-1 font-mono text-[10px] text-white/80 truncate">
            {signal.setup_detected}
          </span>
          <span className="font-mono text-[9px] text-white/45">{signal.confidence_pct}%</span>
        </div>
      )}

      {/* Botón eliminar (hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-2 rounded px-1.5 py-0.5 font-mono text-[10px] text-rose/70 opacity-0 transition hover:bg-rose/[0.08] hover:text-rose group-hover:opacity-100"
        aria-label={`Eliminar ${ticker}`}
      >
        ×
      </button>
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────

function DataCell({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 font-mono text-[7px] uppercase tracking-wider text-white/35">
        {label}
      </div>
      <div className="truncate">{children}</div>
    </div>
  );
}

function DeltaCell({ delta }: { delta: RadarRow_t['delta'] }) {
  if (!delta.has_previous && !delta.anomaly_new) {
    return <span className="font-mono text-[10px] text-white/30">—</span>;
  }

  // Prioridad de etiqueta: FLIP > NUEVO > Δ confluencia
  if (delta.direction_flipped || delta.a3_signal_flipped) {
    return (
      <Glossed term="flip">
        <span
          className="inline-flex items-center gap-1 rounded border border-amber/40 bg-amber/[0.08] px-1.5 py-0.5 font-orbitron text-[8px] font-bold uppercase tracking-wider text-amber"
          title={delta.direction_flipped ? 'A4 cambió de dirección' : 'A3 cambió de señal'}
        >
          FLIP
        </span>
      </Glossed>
    );
  }

  if (delta.anomaly_new) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-rose/40 bg-rose/[0.08] px-1.5 py-0.5 font-orbitron text-[8px] font-bold uppercase tracking-wider text-rose">
        NUEVO
      </span>
    );
  }

  const d = delta.confluence_delta_pct;
  if (d === null) return <span className="font-mono text-[10px] text-white/30">—</span>;
  const sign = d > 0 ? '↑' : d < 0 ? '↓' : '=';
  const cls = d > 0 ? 'text-emerald' : d < 0 ? 'text-rose' : 'text-white/55';
  return (
    <span className={cn('font-mono text-[10px]', cls)} title="Δ confluencia vs análisis anterior">
      {sign} {Math.abs(d)}pts
    </span>
  );
}

function DistanceBlock({
  label,
  term,
  pct,
  accent,
}: {
  label: string;
  /** Slug del glosario — habilita la lente educativa sobre la etiqueta. */
  term: string;
  pct: number | null;
  accent: string;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[7px] uppercase tracking-wider text-white/40">
        <Glossed term={term}>{label}</Glossed>
      </div>
      <div className={cn('font-mono text-[10px] font-medium', pct === null ? 'text-white/30' : accent)}>
        {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
      </div>
    </div>
  );
}

function DirectionGlyph({ direction }: { direction: 'positivo' | 'negativo' | 'neutral' }) {
  if (direction === 'positivo') {
    return <span className="text-emerald text-[11px]" aria-label="alcista">▲</span>;
  }
  if (direction === 'negativo') {
    return <span className="text-rose text-[11px]" aria-label="bajista">▼</span>;
  }
  return <span className="text-white/45 text-[11px]" aria-label="neutral">◆</span>;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}
