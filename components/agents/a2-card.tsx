import type { A2Output } from '@/agents/a2/schema';
import { AgentCardShell, IdleState, ScanSteps, type AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';
import { DataSection, SignalBox } from './a1-card';

interface A2CardProps {
  status: AgentStatus;
  data: A2Output | null;
}

export function A2Card({ status, data }: A2CardProps) {
  return (
    <AgentCardShell accent="cyan" badge="A2" title="Macro" status={status} source="Bloomberg · Fed">
      {status === 'idle' && <IdleState label="standby" />}
      {status === 'scanning' && (
        <ScanSteps
          steps={[
            { label: 'régimen económico actual', done: false },
            { label: 'curva de tipos · Fed funds', done: false },
            { label: 'correlaciones cruzadas', done: false },
            { label: 'previsión 1Y / 3Y', done: false },
          ]}
        />
      )}
      {status === 'error' && <div className="font-mono text-[10px] text-rose py-2">error en A2 — reintenta</div>}
      {(status === 'done' || status === 'anomaly') && data && <A2Body data={data} />}
    </AgentCardShell>
  );
}

function A2Body({ data }: { data: A2Output }) {
  const { macro_context, factores_clave, opportunity_detected, opportunity_description, confidence, narrative } = data;
  return (
    <>
      <DataSection label="Régimen" source="Bloomberg">
        <div className="font-mono text-[10px] leading-snug text-white py-0.5">
          {macro_context.ciclo_economico} · tipos {macro_context.regimen_tipos} · inflación {macro_context.inflacion_trend}
        </div>
      </DataSection>

      {factores_clave.length > 0 && (
        <DataSection label="Factores clave" source="IMF · BCs">
          {factores_clave.slice(0, 4).map((f, i) => (
            <div key={i} className="flex items-center gap-1 border-b border-white/5 py-0.5 last:border-b-0">
              <span className="font-mono text-[10px] flex-1 text-slate-l">{f.factor}</span>
              <span className="font-mono text-[10px] font-medium text-white">{f.magnitud}/5</span>
              <span
                className={cn(
                  'text-[11px]',
                  f.impacto === 'positivo' ? 'text-emerald' : f.impacto === 'negativo' ? 'text-rose' : 'text-slate'
                )}
              >
                {f.impacto === 'positivo' ? '↑' : f.impacto === 'negativo' ? '↓' : '→'}
              </span>
            </div>
          ))}
        </DataSection>
      )}

      {opportunity_detected && opportunity_description && (
        <SignalBox tone="bull">
          <div className="font-mono text-[8px] font-medium text-emerald mb-0.5">⚡ oportunidad macro detectada</div>
          <div className="font-mono text-[10px] leading-snug text-white">{opportunity_description}</div>
        </SignalBox>
      )}

      <SignalBox tone={confidence >= 4 ? 'bull' : 'neut'}>
        <div className={cn('font-mono text-[8px] font-medium mb-0.5', confidence >= 4 ? 'text-emerald' : 'text-slate-l')}>
          A2 · confianza {confidence}/5
        </div>
        <div className="font-mono text-[10px] leading-snug text-white">{narrative}</div>
      </SignalBox>
    </>
  );
}
