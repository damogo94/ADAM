import type { A2Output } from '@/agents/a2/schema';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';
import { ScanCarousel } from '@/components/scan-carousel';
import { cn } from '@/lib/utils';
import { DataSection, SignalBox } from './a1-card';

interface A2CardProps {
  status: AgentStatus;
  data: A2Output | null;
  failureMessage?: string;
}

export function A2Card({ status, data, failureMessage }: A2CardProps) {
  return (
    <AgentCardShell accent="cyan" badge="A2" title="Macro" status={status} source="Bloomberg · Fed">
      {status === 'idle' && <IdleState label="standby" />}
      {status === 'scanning' && (
        <ScanCarousel
          tasks={[
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
          ]}
        />
      )}
      {status === 'error' && (
        <div className="py-2 space-y-1">
          <div className="font-mono text-[10px] text-rose">error en A2 — reintenta</div>
          {failureMessage && (
            <div className="font-mono text-[9px] text-white/45 leading-snug break-words">{failureMessage}</div>
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
      <DataSection label="Régimen" source="Bloomberg">
        <div className="font-mono text-[10px] leading-snug text-white/90 py-0.5">
          {macro_context.ciclo_economico} · tipos {macro_context.regimen_tipos} · inflación {macro_context.inflacion_trend}
        </div>
      </DataSection>

      {factores_clave.length > 0 && (
        <DataSection label="Factores clave" source="IMF · BCs">
          {factores_clave.slice(0, 4).map((f, i) => (
            <div key={i} className="flex items-center gap-1 border-b border-white/5 py-0.5 last:border-b-0">
              <span className="font-mono text-[10px] flex-1 text-white/65">{f.factor}</span>
              <span className="font-mono text-[10px] font-medium text-white">{f.magnitud}/5</span>
              <span
                className={cn(
                  'text-[11px]',
                  f.impacto === 'positivo' && 'text-emerald',
                  f.impacto === 'negativo' && 'text-rose',
                  f.impacto === 'neutral' && 'text-white/45'
                )}
                aria-label={f.impacto}
              >
                {f.impacto === 'positivo' ? '↑' : f.impacto === 'negativo' ? '↓' : '→'}
              </span>
            </div>
          ))}
        </DataSection>
      )}

      {opportunity_detected && opportunity_description && (
        <SignalBox tone="bull">
          <div className="font-mono text-[8px] font-medium text-emerald mb-0.5 uppercase tracking-wider">
            ⚡ oportunidad macro detectada
          </div>
          <div className="font-mono text-[10px] leading-snug text-white/95">{opportunity_description}</div>
        </SignalBox>
      )}

      <SignalBox tone={confidence >= 61 ? 'bull' : 'neut'}>
        <div
          className={cn(
            'font-mono text-[8px] font-medium mb-0.5 uppercase tracking-wider',
            confidence >= 61 ? 'text-white' : 'text-white/55'
          )}
        >
          A2 · confianza {confidence}%
        </div>
        <div className="font-mono text-[10px] leading-snug text-white/90">{narrative}</div>
      </SignalBox>
    </>
  );
}
