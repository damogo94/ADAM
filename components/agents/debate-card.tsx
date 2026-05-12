import type { DebateOutput } from '@/agents/debate/schema';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';

interface DebateCardProps {
  status: AgentStatus;
  data: DebateOutput | null;
}

export function DebateCard({ status, data }: DebateCardProps) {
  return (
    <AgentCardShell
      accent="violet"
      badge="A1×A2"
      title="Contraste · Validación"
      status={status}
      dashed
    >
      {status === 'idle' && <IdleState label="esperando anomalía..." />}
      {status === 'scanning' && (
        <div className="font-mono text-[10px] text-slate py-2 text-center">procesando debate...</div>
      )}
      {status === 'error' && <div className="font-mono text-[10px] text-rose py-2">error en debate</div>}
      {data && (status === 'done' || status === 'anomaly') && (
        <>
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="self-start max-w-[90%] rounded-lg border border-a1/[0.18] bg-a1/10 px-2.5 py-1.5 font-mono text-[10px] leading-snug text-white">
              <strong className="text-a1">A1 →</strong> {data.argumento_a1}
            </div>
            <div className="self-end max-w-[90%] rounded-lg border border-a2/[0.18] bg-a2/[0.08] px-2.5 py-1.5 font-mono text-[10px] leading-snug text-white">
              <strong className="text-a2">A2 →</strong> {data.argumento_a2}
            </div>
            {data.punto_critico_de_debate && (
              <div className="self-start max-w-[90%] rounded-lg border border-a4/[0.18] bg-a4/10 px-2.5 py-1.5 font-mono text-[10px] leading-snug text-white">
                <strong className="text-a4">⚖</strong> {data.punto_critico_de_debate}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-a4/[0.22] bg-a4/[0.07] px-2.5 py-1.5">
            <div className="font-mono text-[8px] font-medium text-a4 mb-0.5">
              {data.oportunidad_validada ? 'oportunidad validada' : 'oportunidad invalidada'} · convergencia {data.convergence_score}/5 · {data.direccion}
            </div>
            <div className="font-mono text-[10px] leading-snug text-white">{data.recomendacion_consolidada}</div>
          </div>
        </>
      )}
    </AgentCardShell>
  );
}
