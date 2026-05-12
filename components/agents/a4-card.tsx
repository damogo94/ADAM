import type { A4Output } from '@/agents/a4/schema';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';
import { SignalBox } from './a1-card';

interface A4CardProps {
  status: AgentStatus;
  data: A4Output | null;
  aligned?: boolean;
}

export function A4Card({ status, data, aligned = false }: A4CardProps) {
  return (
    <AgentCardShell accent="slate" badge="A4" title="Sistema · Ensamblado final" status={status}>
      {status === 'idle' && <IdleState label="esperando agentes..." />}
      {status === 'scanning' && <div className="font-mono text-[10px] text-slate py-2 text-center">ensamblando...</div>}
      {status === 'error' && <div className="font-mono text-[10px] text-rose py-2">error en A4</div>}
      {data && status === 'done' && <A4Body data={data} aligned={aligned} />}
    </AgentCardShell>
  );
}

function A4Body({ data, aligned }: { data: A4Output; aligned: boolean }) {
  const { direccion, confianza, accion_sugerida, riesgo_clave, resumen_a1, resumen_a2, resumen_a3, confluence } = data;
  const dirLabel = direccion === 'positivo' ? '↑ ALCISTA' : direccion === 'negativo' ? '↓ BAJISTA' : '→ NEUTRAL';
  const dirCls =
    direccion === 'positivo' ? 'text-emerald' : direccion === 'negativo' ? 'text-rose' : 'text-slate-l';
  const confCls =
    confianza === 'alta'
      ? 'bg-emerald/10 text-emerald border-emerald/30'
      : confianza === 'media'
        ? 'bg-a3/10 text-a3 border-a3/30'
        : 'bg-slate/10 text-slate-l border-slate/20';

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className={cn('font-orbitron text-[16px] font-bold tracking-wider', dirCls)}>{dirLabel}</span>
        <span className={cn('rounded border px-2 py-0.5 font-mono text-[9px] font-medium', confCls)}>
          {confianza} · {confluence.score_total_pct}%
        </span>
        {aligned && <span className="font-mono text-[9px] text-emerald">A3 alineado</span>}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <ResumenBlock accent="text-a1" badge="A1" text={resumen_a1} />
        <ResumenBlock accent="text-a2" badge="A2" text={resumen_a2} />
        <ResumenBlock accent="text-a3" badge="A3" text={resumen_a3} />
      </div>

      <SignalBox tone={confluence.score_total_pct >= 67 ? 'bull' : 'neut'}>
        <div
          className={cn(
            'font-mono text-[8px] font-medium mb-0.5',
            confluence.score_total_pct >= 67 ? 'text-emerald' : 'text-slate-l'
          )}
        >
          recomendación del sistema
        </div>
        <div className="font-mono text-[10px] leading-snug text-white mb-1">{accion_sugerida}</div>
        <div className="font-mono text-[9px] text-slate-l border-t border-white/5 pt-1 mt-1">
          <span className="text-rose">▲ riesgo clave:</span> {riesgo_clave}
        </div>
      </SignalBox>
    </>
  );
}

function ResumenBlock({ accent, badge, text }: { accent: string; badge: string; text: string }) {
  return (
    <div className="rounded-lg bg-black/30 px-2 py-1.5">
      <div className={cn('mb-0.5 font-mono text-[8px] font-medium uppercase tracking-wider', accent)}>{badge}</div>
      <div className="font-mono text-[9px] leading-snug text-white">{text}</div>
    </div>
  );
}
