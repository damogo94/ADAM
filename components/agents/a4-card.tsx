import type { A4Output } from '@/agents/a4/schema';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';
import { SignalBox } from './a1-card';

interface A4CardProps {
  status: AgentStatus;
  data: A4Output | null;
  aligned?: boolean;
}

/**
 * A4 — recomendación final consolidada.
 *
 * Re-skin B&W: la dirección (alcista/bajista/neutral) y la confianza
 * (alta/media/baja) antes diferenciaban por color (emerald/rose/amber).
 * Ahora se diferencian por:
 *   - dirección → símbolo ↑/↓/→ + intensidad del texto
 *   - confianza → border-weight + bg-intensity
 *   - "A3 alineado" → outline blanco firme (cuando aplica)
 */
export function A4Card({ status, data, aligned = false }: A4CardProps) {
  return (
    <AgentCardShell accent="slate" badge="A4" title="Sistema · Ensamblado final" status={status}>
      {status === 'idle' && <IdleState label="esperando agentes..." />}
      {status === 'scanning' && (
        <div className="font-mono text-[10px] text-white/55 py-2 text-center">ensamblando...</div>
      )}
      {status === 'error' && (
        <div className="font-mono text-[10px] text-white/65 py-2">error en A4</div>
      )}
      {data && status === 'done' && <A4Body data={data} aligned={aligned} />}
    </AgentCardShell>
  );
}

function A4Body({ data, aligned }: { data: A4Output; aligned: boolean }) {
  const { direccion, confianza, accion_sugerida, riesgo_clave, resumen_a1, resumen_a2, resumen_a3, confluence } = data;
  const dirLabel =
    direccion === 'positivo' ? '↑ ALCISTA' : direccion === 'negativo' ? '↓ BAJISTA' : '→ NEUTRAL';
  // Re-skin: dirección por intensidad. Positivo/negativo igualmente
  // prominentes (acción requerida); neutral más dim.
  const dirCls = direccion === 'neutral' ? 'text-white/60' : 'text-white';
  const confCls =
    confianza === 'alta'
      ? 'bg-white/[0.08] text-white border-white/40'
      : confianza === 'media'
        ? 'bg-white/[0.04] text-white/85 border-white/20'
        : 'bg-white/[0.02] text-white/55 border-white/10';

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className={cn('font-orbitron text-[16px] font-bold tracking-wider', dirCls)}>{dirLabel}</span>
        <span
          className={cn(
            'rounded border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider',
            confCls
          )}
        >
          {confianza} · {confluence.score_total_pct}%
        </span>
        {aligned && (
          <span className="rounded border border-white/35 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-white tracking-wider">
            A3 alineado
          </span>
        )}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <ResumenBlock badge="A1" text={resumen_a1} />
        <ResumenBlock badge="A2" text={resumen_a2} />
        <ResumenBlock badge="A3" text={resumen_a3} />
      </div>

      <SignalBox tone={confluence.score_total_pct >= 67 ? 'bull' : 'neut'}>
        <div
          className={cn(
            'font-mono text-[8px] font-medium mb-0.5 uppercase tracking-wider',
            confluence.score_total_pct >= 67 ? 'text-white' : 'text-white/55'
          )}
        >
          recomendación del sistema
        </div>
        <div className="font-mono text-[10px] leading-snug text-white/95 mb-1">{accion_sugerida}</div>
        <div className="font-mono text-[9px] text-white/65 border-t border-white/10 pt-1 mt-1">
          <span className="text-white font-medium">▲ riesgo clave:</span> {riesgo_clave}
        </div>
      </SignalBox>
    </>
  );
}

function ResumenBlock({ badge, text }: { badge: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5">
      <div className="mb-0.5 font-mono text-[8px] font-medium uppercase tracking-wider text-white">
        {badge}
      </div>
      <div className="font-mono text-[9px] leading-snug text-white/85">{text}</div>
    </div>
  );
}
