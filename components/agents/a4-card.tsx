import type { A4Output_t as A4Output } from '@/agents/shared/types';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';
import { DirectionBadge, ConfidenceChip } from '@/components/agent-primitives';
import { SignalBox } from './a1-card';

interface A4CardProps {
  status: AgentStatus;
  data: A4Output | null;
  aligned?: boolean;
  /**
   * Confluencia % recalculada en cliente — fuente ÚNICA de display. La card
   * de A4 horneó su `data.confluence` en el run (posible bake sin A2 → first-run
   * gap, p.ej. 17% mientras el indicador muestra 22%). Mostramos esta para que
   * card, indicador y verdict-bar coincidan. Si falta, cae a la horneada.
   */
  confluencePct?: number;
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
export function A4Card({ status, data, aligned = false, confluencePct }: A4CardProps) {
  const hasData = data != null && status === 'done';
  return (
    <AgentCardShell
      accent="slate"
      badge="A4"
      title="Sistema · Ensamblado final"
      status={status}
      summary={hasData ? <A4Summary data={data} confluencePct={confluencePct} /> : undefined}
    >
      {status === 'idle' && <IdleState label="esperando agentes..." />}
      {status === 'scanning' && (
        <div className="font-mono text-[12px] text-white/66 py-2 text-center">ensamblando...</div>
      )}
      {status === 'error' && (
        <div className="font-mono text-[12px] text-rose py-2">error en A4</div>
      )}
      {data && status === 'done' && <A4Body data={data} aligned={aligned} confluencePct={confluencePct} />}
    </AgentCardShell>
  );
}

function A4Body({ data, aligned, confluencePct }: { data: A4Output; aligned: boolean; confluencePct?: number }) {
  const { direccion, confianza, accion_sugerida, riesgo_clave, resumen_a1, resumen_a2, resumen_a3, confluence } = data;
  // Fuente única de display: la confluencia recalculada en cliente manda sobre
  // la horneada en A4 (que puede venir del bake sin A2). Fallback a la horneada.
  const pct = confluencePct ?? confluence.score_total_pct;
  const dirLabel =
    direccion === 'positivo' ? '↑ ALCISTA' : direccion === 'negativo' ? '↓ BAJISTA' : '→ NEUTRAL';
  // Color semántico (sesión 5b): positivo=emerald, negativo=rose, neutral=blanco.
  const dirCls =
    direccion === 'positivo'
      ? 'text-emerald'
      : direccion === 'negativo'
        ? 'text-rose'
        : 'text-white/65';
  const confCls =
    confianza === 'alta'
      ? 'bg-emerald/[0.08] text-emerald border-emerald/35'
      : confianza === 'media'
        ? 'bg-amber/[0.07] text-amber border-amber/30'
        : 'bg-white/[0.02] text-white/66 border-white/12';

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className={cn('font-sans text-[16px] font-bold tracking-wider', dirCls)}>{dirLabel}</span>
        <span
          className={cn(
            'rounded border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider',
            confCls
          )}
        >
          {confianza} · {pct}%
        </span>
        {aligned && (
          <span className="rounded border border-emerald/40 bg-emerald/[0.10] px-1.5 py-0.5 font-mono text-[11px] text-emerald tracking-wider">
            A3 alineado
          </span>
        )}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <ResumenBlock badge="A1" text={resumen_a1} />
        <ResumenBlock badge="A2" text={resumen_a2} />
        <ResumenBlock badge="A3" text={resumen_a3} />
      </div>

      <SignalBox tone={pct >= 67 ? 'bull' : 'neut'}>
        <div
          className={cn(
            'font-mono text-[11px] font-medium mb-0.5 uppercase tracking-wider',
            pct >= 67 ? 'text-emerald' : 'text-white/66'
          )}
        >
          recomendación del sistema
        </div>
        <div className="font-mono text-[12px] leading-snug text-white/95 mb-1">{accion_sugerida}</div>
        <div className="font-mono text-[12px] text-white/65 border-t border-white/10 pt-1 mt-1">
          <span className="text-rose font-medium">▲ riesgo clave:</span> {riesgo_clave}
        </div>
      </SignalBox>
    </>
  );
}

function ResumenBlock({ badge, text }: { badge: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5">
      <div className="mb-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-white">
        {badge}
      </div>
      <div className="font-mono text-[12px] leading-snug text-white/85">{text}</div>
    </div>
  );
}

/** Fila-veredicto de A4: dirección consolidada + confluencia% + confianza. */
function A4Summary({ data, confluencePct }: { data: A4Output; confluencePct?: number }) {
  const dirLabel =
    data.direccion === 'positivo' ? 'ALCISTA' : data.direccion === 'negativo' ? 'BAJISTA' : 'NEUTRAL';
  const pct = confluencePct ?? data.confluence.score_total_pct;
  return (
    <>
      <DirectionBadge dir={data.direccion} />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-bold tracking-wider text-white">
        {dirLabel} · {pct}%
      </span>
      <ConfidenceChip value={data.confianza} showBar />
    </>
  );
}
