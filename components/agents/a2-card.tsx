import type { A2Output_t as A2Output } from '@/agents/shared/types';
import { AgentCardShell, IdleState, ScanSteps, type AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';
import { DirectionBadge, ConfidenceChip, SegmentBar } from '@/components/agent-primitives';
import { DataSection, SignalBox } from './a1-card';

interface A2CardProps {
  status: AgentStatus;
  data: A2Output | null;
  failureMessage?: string;
}

export function A2Card({ status, data, failureMessage }: A2CardProps) {
  const hasData = data != null && (status === 'done' || status === 'anomaly');
  return (
    <AgentCardShell
      badge="A2"
      title="Macro"
      status={status}
      source="FRED"
      summary={hasData ? <A2Summary data={data} /> : undefined}
      defaultOpen={data?.opportunity_detected ?? false}
    >
      {status === 'idle' && <IdleState label="standby" />}
      {status === 'scanning' && (
        <ScanSteps
          steps={[
            'régimen económico actual',
            'ciclo · expansión / contracción',
            'curva de tipos · Fed funds',
            'BCE · BoE · política monetaria',
            'inflación · CPI YoY',
            'PMI manufacturero · servicios',
            'correlaciones cruzadas · activos',
            'factores geopolíticos',
            'régimen risk-on / risk-off',
            'previsión 1Y / 3Y · rangos',
            'componiendo narrativa A2',
          ].map((label) => ({ label, done: false }))}
        />
      )}
      {status === 'error' && (
        <div className="py-2 space-y-1">
          <div className="font-mono text-fluid-caption text-ink/80">error en A2 — reintenta</div>
          {failureMessage && (
            <div className="font-mono text-fluid-caption text-ink/66 leading-snug break-words">{failureMessage}</div>
          )}
        </div>
      )}
      {(status === 'done' || status === 'anomaly') && data && <A2Body data={data} />}
    </AgentCardShell>
  );
}

function A2Body({ data }: { data: A2Output }) {
  const { macro_context, factores_clave, opportunity_detected, opportunity_description, confidence, narrative } = data;
  return (
    <>
      <DataSection label="Régimen" source="FRED">
        <div className="font-mono text-fluid-caption leading-snug text-ink/90 py-0.5">
          {macro_context.ciclo_economico} · tipos {macro_context.regimen_tipos} · inflación {macro_context.inflacion_trend}
        </div>
      </DataSection>

      {factores_clave.length > 0 && (
        <DataSection label="Factores clave" source="FRED">
          {factores_clave.slice(0, 4).map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 border-b border-white/5 py-0.5 last:border-b-0">
              <span className="font-mono text-fluid-caption flex-1 text-ink/65">{f.factor}</span>
              <SegmentBar value={f.magnitud} />
              <DirectionBadge dir={f.impacto} />
            </div>
          ))}
        </DataSection>
      )}

      {opportunity_detected && opportunity_description && (
        <SignalBox tone="bull">
          <div className="font-mono text-fluid-micro font-medium text-emerald mb-0.5 uppercase tracking-wider">
            ⚡ oportunidad macro detectada
          </div>
          <div className="font-mono text-fluid-caption leading-snug text-ink/95">{opportunity_description}</div>
        </SignalBox>
      )}

      <SignalBox tone={confidence >= 61 ? 'conf' : 'neut'}>
        <div
          className={cn(
            'font-mono text-fluid-micro font-medium mb-0.5 uppercase tracking-wider',
            confidence >= 61 ? 'text-ink' : 'text-ink/66'
          )}
        >
          A2 · confianza {confidence}%
        </div>
        <div className="font-mono text-fluid-caption leading-snug text-ink/90">{narrative}</div>
      </SignalBox>
    </>
  );
}

/** Fila-veredicto de A2: régimen macro + dirección + confianza. */
function A2Summary({ data }: { data: A2Output }) {
  const m = data.macro_context;
  // regime_outlook es nullable/optional; fallback documentado en el schema:
  // sin él, opportunity_detected → alcista, resto → neutral.
  const dir = data.regime_outlook ?? (data.opportunity_detected ? 'risk_on' : 'neutral');
  return (
    <>
      <DirectionBadge dir={dir} />
      <span className="min-w-0 flex-1 truncate font-mono text-fluid-caption font-medium text-ink">
        {m.ciclo_economico} · {m.regimen_tipos} · {m.inflacion_trend}
      </span>
      <ConfidenceChip value={data.confidence} showBar />
    </>
  );
}
