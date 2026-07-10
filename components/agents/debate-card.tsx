import type { DebateOutput } from '@/agents/debate/schema';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';
import { DirectionBadge, ConfidenceChip } from '@/components/agent-primitives';
import { Razonamiento } from '@/components/disclosure';
import { useLandingBeat } from '@/hooks/use-landing-beat';

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
  const hasData = data != null && (status === 'done' || status === 'anomaly');
  const landNonce = useLandingBeat(status);
  return (
    <AgentCardShell
      badge="A1×A2"
      title="Contraste · Validación"
      status={status}
      dashed
      summary={hasData ? <DebateSummary data={data} /> : undefined}
      defaultOpen={data?.oportunidad_validada ?? false}
    >
      {status === 'idle' && <IdleState label="esperando anomalía..." />}
      {status === 'scanning' && (
        <div className="font-mono text-fluid-caption text-ink/66 py-2 text-center">procesando debate...</div>
      )}
      {status === 'error' && (
        <div className="font-mono text-fluid-caption text-ink/80 py-2">error en debate</div>
      )}
      {data && (status === 'done' || status === 'anomaly') && (
        <>
          {/* ── NIVEL 2 · recomendación consolidada (conclusión decision-grade) ──
              La línea-titular del box (validada · convergencia · dirección) se
              SUPRIME: era 100% redundante con la fila-veredicto de nivel 1. Solo
              la recomendación es contenido nuevo → se queda visible al abrir. */}
          <div className="rounded-lg border border-white/30 bg-white/[0.06] px-2.5 py-1.5">
            <div className="font-mono text-fluid-caption leading-snug text-ink/90">{data.recomendacion_consolidada}</div>
          </div>

          {/* ── NIVEL 3 · razonamiento: el ida y vuelta A1 × A2 ─────────────── */}
          <Razonamiento label="razonamiento" landNonce={landNonce}>
            <div className="flex flex-col gap-1.5">
              {/* A1 bubble — alineado izquierda */}
              <div className="self-start max-w-[90%] rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 font-mono text-fluid-caption leading-snug text-ink/90">
                <strong className="text-ink font-bold tracking-wider">A1 →</strong> {data.argumento_a1}
              </div>
              {/* A2 bubble — alineado derecha */}
              <div className="self-end max-w-[90%] rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 font-mono text-fluid-caption leading-snug text-ink/90">
                <strong className="text-ink font-bold tracking-wider">A2 →</strong> {data.argumento_a2}
              </div>
              {data.punto_critico_de_debate && (
                <div className="self-start max-w-[90%] rounded-lg border border-white/25 bg-white/[0.06] px-2.5 py-1.5 font-mono text-fluid-caption leading-snug text-ink/90">
                  <strong className="text-ink">⚖</strong> {data.punto_critico_de_debate}
                </div>
              )}
            </div>
          </Razonamiento>
        </>
      )}
    </AgentCardShell>
  );
}

/** Fila-veredicto del debate: dirección + validación + convergencia (como confianza). */
function DebateSummary({ data }: { data: DebateOutput }) {
  return (
    <>
      <DirectionBadge dir={data.direccion} />
      <span className="min-w-0 flex-1 truncate font-mono text-fluid-caption font-medium text-ink">
        {data.oportunidad_validada ? 'VALIDADA' : 'INVALIDADA'}
      </span>
      <ConfidenceChip value={data.convergence_score} showBar />
    </>
  );
}
