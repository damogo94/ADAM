'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { cn, getCurrencyFromTicker } from '@/lib/utils';
import {
  extractTradeSummary,
  type TradeSummary,
  type TradeOutcomeSummary,
} from '@/lib/analyses/trade-summary';
import {
  StoredAnalysisView,
  type AnalysisSummaryRow,
  type StoredAnalysis,
} from '@/components/historial/stored-analysis-view';

/**
 * Color SEMÁNTICO de dirección (es DATO, no chrome). La columna `direction`
 * persiste `A4Output.direccion` = enum positivo/negativo/neutral (NO el
 * vocabulario alcista/bajista de trend). Mapeo canónico: verdict-bar.tsx.
 */
function dirMeta(d: string): { label: string; cls: string } {
  if (d === 'positivo') return { label: 'ALCISTA', cls: 'text-emerald' };
  if (d === 'negativo') return { label: 'BAJISTA', cls: 'text-rose' };
  return { label: 'NEUTRAL', cls: 'text-ink/70' };
}

const RESOLVED = new Set(['win', 'loss', 'timeout', 'no_fill']);

/** Color SEMÁNTICO del resultado del trade (es DATO): win→emerald, loss→rose… */
function outcomeMeta(o: string): { label: string; cls: string } {
  switch (o) {
    case 'win':
      return { label: 'WIN', cls: 'text-emerald border-emerald/40 bg-emerald/[0.08]' };
    case 'loss':
      return { label: 'LOSS', cls: 'text-rose border-rose/40 bg-rose/[0.08]' };
    case 'timeout':
      return { label: 'TIMEOUT', cls: 'text-amber border-amber/35 bg-amber/[0.07]' };
    case 'no_fill':
      return { label: 'NO FILL', cls: 'text-ink/66 border-white/15 bg-white/[0.03]' };
    default:
      return { label: 'NO EVALUABLE', cls: 'text-ink/66 border-white/10 bg-white/[0.02]' };
  }
}

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function OutcomeBadge({ outcome }: { outcome: TradeOutcomeSummary }) {
  const m = outcomeMeta(outcome.outcome);
  const showR =
    RESOLVED.has(outcome.outcome) && outcome.outcome !== 'no_fill' && outcome.r_multiple != null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-wider',
        m.cls
      )}
    >
      {m.label}
      {showR && (
        <span className="tabular-nums">
          {outcome.r_multiple! >= 0 ? '+' : ''}
          {outcome.r_multiple!.toFixed(1)}R
        </span>
      )}
    </span>
  );
}

/** Banner de trade destacado en el detalle — la operación es lo accionable. */
function TradeBanner({
  trade,
  outcome,
  ticker,
}: {
  trade: TradeSummary;
  outcome: TradeOutcomeSummary | null;
  ticker: string;
}) {
  const ccy = getCurrencyFromTicker(ticker);
  const long = trade.signal === 'buy';
  return (
    <div className="mx-4 mt-3 rounded-card border border-white/12 bg-surface-2 px-3.5 py-3 shadow-e2">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn('font-sans text-[12px] font-bold tracking-wider', long ? 'text-emerald' : 'text-rose')}
        >
          {long ? '▲ TRADE · LONG' : '▼ TRADE · SHORT'}
        </span>
        {trade.horizonte && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink/45">
            {trade.horizonte}
          </span>
        )}
        {outcome && (
          <span className="ml-auto">
            <OutcomeBadge outcome={outcome} />
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Lvl label="ENTRADA" value={fmtPrice(trade.entrada)} />
        <Lvl label="STOP" value={fmtPrice(trade.stop_loss)} cls="text-rose" />
        <Lvl label="TARGET" value={fmtPrice(trade.target)} cls="text-emerald" />
        <Lvl label="R/B" value={trade.rb != null ? trade.rb.toFixed(2) : '—'} cls="text-amber" />
      </div>
      {outcome && (outcome.return_pct != null || outcome.resolved_days != null) && (
        <div className="mt-2 font-mono text-[11px] text-ink/66">
          resultado:{' '}
          {outcome.return_pct != null && (
            <span className={cn('font-medium', outcome.return_pct >= 0 ? 'text-emerald' : 'text-rose')}>
              {outcome.return_pct >= 0 ? '+' : ''}
              {outcome.return_pct.toFixed(1)}%
            </span>
          )}
          {outcome.resolved_days != null && <span> · {outcome.resolved_days}d hasta resolución</span>}
        </div>
      )}
      {!outcome && (
        <div className="mt-2 font-mono text-[11px] text-ink/55">
          {trade.horizonte === 'intradia'
            ? 'intradía · sin seguimiento automático (el backtest solo evalúa swing/posicional)'
            : 'en seguimiento · el cron evalúa el resultado al tocar target o stop'}
        </div>
      )}
      <div className="mt-1 font-mono text-[10px] text-ink/40">
        moneda: {ccy} · el análisis de abajo es el soporte de la decisión
      </div>
    </div>
  );
}

function Lvl({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/20 px-2 py-1.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/45">{label}</div>
      <div className={cn('mt-0.5 font-mono text-[12px] font-medium tabular-nums text-ink', cls)}>
        {value}
      </div>
    </div>
  );
}

export default function HistorialScreen() {
  const router = useRouter();
  const [list, setList] = useState<AnalysisSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoredAnalysis | null>(null);
  const [detailOutcome, setDetailOutcome] = useState<TradeOutcomeSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // El trade del detalle se deriva del a3_output guardado (mismo helper que la API).
  const detailTrade = useMemo(() => (detail ? extractTradeSummary(detail.a3_output) : null), [detail]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/analyses');
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/historial');
          return;
        }
        throw new Error(`No se pudo cargar el historial (HTTP ${r.status}).`);
      }
      const data = (await r.json()) as { analyses: AnalysisSummaryRow[] };
      setList(data.analyses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDetailOutcome(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/analyses/${id}`);
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/historial');
          return;
        }
        throw new Error(
          r.status === 404 ? 'Ese análisis ya no está disponible.' : 'No se pudo abrir el análisis.'
        );
      }
      const data = (await r.json()) as {
        analysis: StoredAnalysis;
        outcome: TradeOutcomeSummary | null;
      };
      setDetail(data.analysis);
      setDetailOutcome(data.outcome ?? null);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'No se pudo abrir el análisis.');
    } finally {
      setDetailLoading(false);
    }
  }

  function back() {
    setSelectedId(null);
    setDetail(null);
    setDetailOutcome(null);
    setDetailError(null);
  }

  // ── Vista DETALLE (read-only del run guardado) ────────────────────────────
  if (selectedId) {
    return (
      <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-3xl lg:max-w-6xl xl:max-w-7xl">
        <Header status={detailLoading ? 'running' : detailError ? 'error' : 'ok'} />

        <div className="mx-4 mt-2 flex items-center justify-between gap-2 font-mono text-[12px]">
          <button
            onClick={back}
            className="inline-flex items-center gap-1 text-ink/45 underline-offset-2 transition-colors hover:text-ink/75 hover:underline"
          >
            ← historial
          </button>
          {detail && (
            <Link
              href={`/analysis?ticker=${encodeURIComponent(detail.ticker)}`}
              className="text-ink/45 underline-offset-2 transition-colors hover:text-ink/75 hover:underline"
            >
              re-analizar en vivo →
            </Link>
          )}
        </div>

        {detail && (
          <div className="mx-4 mt-2 font-mono text-[12px] text-ink/66">
            análisis guardado · {new Date(detail.created_at).toLocaleString()} — vista de solo lectura
          </div>
        )}

        {detailLoading ? (
          <div className="px-4 py-10 text-center font-mono text-[12px] text-ink/70">
            cargando análisis guardado…
          </div>
        ) : detailError ? (
          <div
            role="alert"
            className="mx-4 mt-3 rounded-card-sm border border-white/30 bg-white/[0.06] px-3 py-3 font-mono text-[12px] leading-snug text-ink/80"
          >
            {detailError}{' '}
            <button onClick={back} className="underline underline-offset-2 hover:text-ink">
              volver
            </button>
          </div>
        ) : detail ? (
          <div className="mt-2">
            {detailTrade ? (
              <TradeBanner trade={detailTrade} outcome={detailOutcome} ticker={detail.ticker} />
            ) : (
              <div className="mx-4 mt-3 rounded-card-sm border border-dashed border-white/10 bg-surface-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/40">
                solo análisis · este run no generó trade (hold / sin niveles)
              </div>
            )}
            <StoredAnalysisView a={detail} />
          </div>
        ) : null}

        <footer className="px-5 pt-6 text-center font-mono text-[12px] text-ink/66 leading-relaxed">
          Análisis educativo · no constituye asesoramiento financiero regulado
        </footer>
      </div>
    );
  }

  // ── Vista LISTA ───────────────────────────────────────────────────────────
  const tradeCount = list.filter((a) => a.trade).length;

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : error ? 'error' : 'ok'} />

      <SectionLabel>
        historial · {loading ? '—' : list.length}
        {!loading && tradeCount > 0 && (
          <span className="ml-1 normal-case text-ink/45">— {tradeCount} con trade</span>
        )}
      </SectionLabel>

      <p className="px-4 font-mono text-[12px] text-ink/66 leading-snug">
        Tus análisis guardados. El <span className="text-ink/85">trade</span> (entrada · SL · TP) es lo
        accionable; el análisis es el soporte. Ábrelos sin re-ejecutar ni gastar cuota.
      </p>

      {loading ? (
        <div className="px-4 py-10 text-center font-mono text-[12px] text-ink/70">cargando historial…</div>
      ) : error ? (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-card-sm border border-white/30 bg-white/[0.06] px-3 py-3 font-mono text-[12px] leading-snug text-ink/80"
        >
          {error}{' '}
          <button onClick={() => void load()} className="underline underline-offset-2 hover:text-ink">
            reintentar
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="mx-4 mt-3 rounded-card-sm border border-dashed border-white/10 bg-surface-2 px-3 py-8 text-center">
          <div className="font-mono text-[12px] text-ink/70 mb-1">sin análisis guardados</div>
          <div className="font-mono text-[12px] text-ink/66">
            cada análisis que ejecutes en{' '}
            <Link href="/analysis" className="text-accent underline-offset-2 hover:underline">
              /analysis
            </Link>{' '}
            quedará aquí para revisitarlo.
          </div>
        </div>
      ) : (
        <div className="mt-2 px-4 space-y-1.5">
          {list.map((a) => {
            const dir = dirMeta(a.direction);
            const pct = a.actionable_pct ?? a.confluence_pct;
            return (
              <button
                key={a.id}
                onClick={() => void openDetail(a.id)}
                className="block w-full rounded-card-sm border border-white/8 bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-white/20"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-bold tracking-wider text-ink">{a.ticker}</span>
                  <span className={cn('font-mono text-[11px] uppercase tracking-wider', dir.cls)}>
                    {dir.label}
                  </span>
                  <span className="ml-auto font-sans text-[14px] font-bold text-ink tabular-nums">
                    {pct}%
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ink/66">
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                  <span className="ml-auto uppercase tracking-wider">{a.confidence}</span>
                </div>

                {a.trade ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/5 pt-1.5 font-mono text-[11px]">
                    <span
                      className={cn(
                        'font-bold tracking-wider',
                        a.trade.signal === 'buy' ? 'text-emerald' : 'text-rose'
                      )}
                    >
                      {a.trade.signal === 'buy' ? '▲ LONG' : '▼ SHORT'}
                    </span>
                    <span className="text-ink/55">
                      in <span className="text-ink/85">{fmtPrice(a.trade.entrada)}</span>
                    </span>
                    <span className="text-rose/90">SL {fmtPrice(a.trade.stop_loss)}</span>
                    <span className="text-emerald/90">TP {fmtPrice(a.trade.target)}</span>
                    {a.trade.rb != null && <span className="text-amber">R/B {a.trade.rb.toFixed(1)}</span>}
                    {a.outcome ? (
                      <span className="ml-auto">
                        <OutcomeBadge outcome={a.outcome} />
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-ink/40">
                        {a.trade.horizonte === 'intradia' ? 'intradía · sin seguim.' : 'en seguimiento'}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/30">
                    solo análisis · sin trade
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-ink/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}
