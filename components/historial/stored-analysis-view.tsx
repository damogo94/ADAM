'use client';

import { useMemo } from 'react';
import { SectionLabel, FlowArrow } from '@/components/section-label';
import { ConfluenceHero } from '@/components/analysis/confluence-hero';
import { A1Card } from '@/components/agents/a1-card';
import { A2Card } from '@/components/agents/a2-card';
import { A3Card } from '@/components/agents/a3-card';
import { DebateCard } from '@/components/agents/debate-card';
import { A4Card } from '@/components/agents/a4-card';
import { EstructuraCard } from '@/components/agents/estructura-card';
import { ConfluenceIndicator } from '@/components/confluence-indicator';
import { VerdictBar } from '@/components/verdict-bar';
import { computeConfluence } from '@/lib/confluence';
import { isCryptoTicker } from '@/lib/market/crypto-registry';
import { getCurrencyFromTicker } from '@/lib/utils';
import type { AgentStatus } from '@/components/agent-card-shell';
import type {
  A1Output_t as A1Output,
  A2Output_t as A2Output,
  A4Output_t as A4Output,
} from '@/agents/shared/types';
import type { A3Output } from '@/agents/a3/schema';
import type { EstructuraOutput_t } from '@/agents/estructura/schema';
import type { DebateOutput } from '@/agents/debate/schema';
import type { TradeSummary, TradeOutcomeSummary } from '@/lib/analyses/trade-summary';

/** Campos escalares comunes a la lista y al detalle del historial. */
interface AnalysisScalars {
  id: string;
  ticker: string;
  confluence_pct: number;
  net_pct: number | null;
  kappa: number | null;
  actionable_pct: number | null;
  direction: string;
  confidence: string;
  latency_ms: number | null;
  created_at: string;
}

/** Fila de la lista del historial: escalares + el trade derivado y su resultado. */
export interface AnalysisSummaryRow extends AnalysisScalars {
  trade: TradeSummary | null;
  outcome: TradeOutcomeSummary | null;
}

/** Run pasado COMPLETO — incluye los outputs de cada agente para el render read-only. */
export interface StoredAnalysis extends AnalysisScalars {
  a1_output: A1Output | null;
  a2_output: A2Output | null;
  a3_output: A3Output | null;
  debate_output: DebateOutput | null;
  a4_output: A4Output | null;
  estructura_output: EstructuraOutput_t | null;
}

/**
 * Render READ-ONLY de un análisis ya persistido en `analyses_log` — SIN re-ejecutar
 * el pipeline (no gasta cuota). Reusa las MISMAS cards prop-driven de /analysis
 * (no hidrata el RunProvider load-bearing): compone el JSON guardado con el `status`
 * derivado del dato (done/anomaly/error) en paridad con el reductor en vivo
 * (`lib/run/apply-event.ts`) y `computeConfluence` cliente, idéntico al provider.
 *
 * Nota: las velas diarias del mini-chart de A3 (`chart_data.daily`) NO se persisten
 * — solo viajan en el evento `final` del stream. En el histórico A3 renderiza sin
 * mini-chart (igual que en vivo antes de que llegue `final`).
 */
export function StoredAnalysisView({ a }: { a: StoredAnalysis }) {
  const a1 = a.a1_output;
  const a2 = a.a2_output;
  const a3 = a.a3_output;
  const debate = a.debate_output;
  const a4 = a.a4_output;
  const estructura = a.estructura_output;

  const confluence = useMemo(
    () => (a1 || a3 || estructura ? computeConfluence(a1, a2, a3, debate, estructura) : null),
    [a1, a2, a3, debate, estructura]
  );

  // Estado derivado para casar con el render en vivo de un run COMPLETO:
  //  - con dato → done (o anomaly si A1/A2 lo marcan), igual que el pipeline.
  //  - a1/a2/a3 sin dato → error: el run terminó, así que un output null es un
  //    fallo de ese agente (el reductor/provider en vivo también acaba en 'error',
  //    nunca 'idle', para un agente que no entregó — apply-event.ts:50 · run-provider:264).
  //  - debate/estructura null = no disparado / opt-in apagado → idle (no es fallo).
  const a1Status: AgentStatus = a1 ? (a1.anomaly_detected ? 'anomaly' : 'done') : 'error';
  const a2Status: AgentStatus = a2 ? (a2.opportunity_detected ? 'anomaly' : 'done') : 'error';
  const a3Status: AgentStatus = a3 ? 'done' : 'error';
  const debateStatus: AgentStatus = debate ? 'done' : 'idle';
  const estructuraStatus: AgentStatus = estructura ? 'done' : 'idle';
  const currency = a1?.price?.currency ?? getCurrencyFromTicker(a.ticker);

  return (
    <>
      {a4 && <VerdictBar a4={a4} confluence={confluence} aligned={confluence?.aligned ?? false} />}

      <ConfluenceHero
        running={false}
        resolved={true}
        statuses={{ a1: a1Status, a2: a2Status, a3: a3Status }}
        estructuraStatus={estructura ? estructuraStatus : undefined}
        a4={a4}
        confluence={confluence}
        debateStatus={debateStatus}
        a1={a1}
        a2={a2}
        a3={a3}
        estructura={estructura}
      />

      <div className="lg:grid lg:grid-cols-12 lg:gap-2 lg:items-start">
        {/* Columna principal: agentes */}
        <div className="lg:col-span-8">
          <SectionLabel>agentes paralelos</SectionLabel>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 px-4">
            <A1Card status={a1Status} data={a1} isCrypto={isCryptoTicker(a.ticker)} />
            <A2Card status={a2Status} data={a2} />
          </div>

          {debate && (
            <>
              <FlowArrow>↓ anomalía detectada</FlowArrow>
              <SectionLabel>debate A1 × A2</SectionLabel>
              <div className="px-4">
                <DebateCard status={debateStatus} data={debate} />
              </div>
            </>
          )}

          <SectionLabel>motor técnico autónomo</SectionLabel>
          <div className="px-4">
            <A3Card status={a3Status} data={a3} dailyCandles={[]} currency={currency} />
          </div>

          {estructura && (
            <>
              <FlowArrow>↓ estructura · futuros (MTF)</FlowArrow>
              <SectionLabel>agente de estructura · aislado</SectionLabel>
              <div className="px-4">
                <EstructuraCard status={estructuraStatus} data={estructura} ticker={a.ticker} />
              </div>
            </>
          )}
        </div>

        {/* Rail de síntesis: confluencia + A4 */}
        <aside className="lg:col-span-4 lg:sticky lg:top-3">
          <SectionLabel>indicador de confluencia</SectionLabel>
          <div className="px-4">
            <ConfluenceIndicator data={confluence} />
          </div>

          {a4 && (
            <>
              <FlowArrow>↓ output al usuario</FlowArrow>
              <SectionLabel>sistema · A4</SectionLabel>
              <div className="px-4">
                <A4Card
                  status="done"
                  data={a4}
                  aligned={confluence?.aligned ?? false}
                  confluencePct={confluence?.actionable_pct ?? confluence?.total_pct}
                />
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
