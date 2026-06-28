'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';
import { SectionLabel } from '@/components/section-label';
import { cn } from '@/lib/utils';
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
  return { label: 'NEUTRAL', cls: 'text-white/70' };
}

export default function HistorialScreen() {
  const router = useRouter();
  const [list, setList] = useState<AnalysisSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoredAnalysis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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
    setDetailError(null);
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/analyses/${id}`);
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login?next=/historial');
          return;
        }
        throw new Error(r.status === 404 ? 'Ese análisis ya no está disponible.' : 'No se pudo abrir el análisis.');
      }
      const data = (await r.json()) as { analysis: StoredAnalysis };
      setDetail(data.analysis);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'No se pudo abrir el análisis.');
    } finally {
      setDetailLoading(false);
    }
  }

  function back() {
    setSelectedId(null);
    setDetail(null);
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
            className="inline-flex items-center gap-1 text-white/45 underline-offset-2 transition-colors hover:text-white/75 hover:underline"
          >
            ← historial
          </button>
          {detail && (
            <Link
              href={`/analysis?ticker=${encodeURIComponent(detail.ticker)}`}
              className="text-white/45 underline-offset-2 transition-colors hover:text-white/75 hover:underline"
            >
              re-analizar en vivo →
            </Link>
          )}
        </div>

        {detail && (
          <div className="mx-4 mt-2 font-mono text-[12px] text-white/66">
            análisis guardado · {new Date(detail.created_at).toLocaleString()} — vista de solo lectura
          </div>
        )}

        {detailLoading ? (
          <div className="px-4 py-10 text-center font-mono text-[12px] text-white/70">
            cargando análisis guardado…
          </div>
        ) : detailError ? (
          <div
            role="alert"
            className="mx-4 mt-3 rounded-[15px] border border-white/30 bg-white/[0.06] px-3 py-3 font-mono text-[12px] leading-snug text-white/80"
          >
            {detailError}{' '}
            <button onClick={back} className="underline underline-offset-2 hover:text-white">
              volver
            </button>
          </div>
        ) : detail ? (
          <div className="mt-2">
            <StoredAnalysisView a={detail} />
          </div>
        ) : null}

        <footer className="px-5 pt-6 text-center font-mono text-[12px] text-white/66 leading-relaxed">
          Análisis educativo · no constituye asesoramiento financiero regulado
        </footer>
      </div>
    );
  }

  // ── Vista LISTA ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-2xl lg:max-w-3xl">
      <Header status={loading ? 'running' : error ? 'error' : 'ok'} />

      <SectionLabel>
        historial · {loading ? '—' : list.length}
      </SectionLabel>

      <p className="px-4 font-mono text-[12px] text-white/66 leading-snug">
        Tus análisis guardados. Abre cualquiera para revisarlo tal cual quedó — sin re-ejecutar
        ni gastar tu cuota diaria.
      </p>

      {loading ? (
        <div className="px-4 py-10 text-center font-mono text-[12px] text-white/70">cargando historial…</div>
      ) : error ? (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[15px] border border-white/30 bg-white/[0.06] px-3 py-3 font-mono text-[12px] leading-snug text-white/80"
        >
          {error}{' '}
          <button onClick={() => void load()} className="underline underline-offset-2 hover:text-white">
            reintentar
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="mx-4 mt-3 rounded-[15px] border border-dashed border-white/10 bg-surface-2 px-3 py-8 text-center">
          <div className="font-mono text-[12px] text-white/70 mb-1">sin análisis guardados</div>
          <div className="font-mono text-[12px] text-white/66">
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
                className="block w-full rounded-[15px] border border-white/8 bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-white/20"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-bold tracking-wider text-white">{a.ticker}</span>
                  <span className={cn('font-mono text-[11px] uppercase tracking-wider', dir.cls)}>
                    {dir.label}
                  </span>
                  <span className="ml-auto font-sans text-[14px] font-bold text-white tabular-nums">
                    {pct}%
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-white/66">
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                  <span className="ml-auto uppercase tracking-wider">{a.confidence}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <footer className="px-5 pt-6 text-center font-mono text-[12px] text-white/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}
