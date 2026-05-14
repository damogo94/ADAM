import type { DebateOutput } from '@/agents/debate/schema';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';

interface DebateCardProps {
  status: AgentStatus;
  data: DebateOutput | null;
}

/**
 * Re-skin B&W: los chat bubbles antes diferenciaban A1 (azul) vs A2 (cyan)
 * vs juez/critico (violeta). Ahora se diferencian por POSICIÓN (start/end),
 * BADGE prefix ("A1 →" / "A2 →" / "⚖"), y INTENSIDAD del border.
 */
export function DebateCard({ status, data }: DebateCardProps) {
  return (
    <AgentCardShell accent="violet" badge="A1×A2" title="Contraste · Validación" status={status} dashed>
      {status === 'idle' && <IdleState label="esperando anomalía..." />}
      {status === 'scanning' && (
        <div className="font-mono text-[10px] text-white/55 py-2 text-center">procesando debate...</div>
      )}
      {status === 'error' && (
        <div className="font-mono text-[10px] text-white/65 py-2">error en debate</div>
      )}
      {data && (status === 'done' || status === 'anomaly') && (
        <>
          <div className="flex flex-col gap-1.5 mb-2">
            {/* A1 bubble — alineado izquierda */}
            <div className="self-start max-w-[90%] rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10px] leading-snug text-white/90">
              <strong className="text-white font-bold tracking-wider">A1 →</strong> {data.argumento_a1}
            </div>
            {/* A2 bubble — alineado derecha */}
            <div className="self-end max-w-[90%] rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10px] leading-snug text-white/90">
              <strong className="text-white font-bold tracking-wider">A2 →</strong> {data.argumento_a2}
            </div>
            {data.punto_critico_de_debate && (
              <div className="self-start max-w-[90%] rounded-lg border border-white/25 bg-white/[0.06] px-2.5 py-1.5 font-mono text-[10px] leading-snug text-white/90">
                <strong className="text-white">⚖</strong> {data.punto_critico_de_debate}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-white/30 bg-white/[0.06] px-2.5 py-1.5">
            <div className="font-mono text-[8px] font-medium text-white mb-0.5 uppercase tracking-wider">
              {data.oportunidad_validada ? 'oportunidad validada' : 'oportunidad invalidada'} · convergencia{' '}
              {data.convergence_score}/5 · {data.direccion}
            </div>
            <div className="font-mono text-[10px] leading-snug text-white/90">{data.recomendacion_consolidada}</div>
          </div>
        </>
      )}
    </AgentCardShell>
  );
}
