import type { A2Output_t as A2Output } from '@/agents/shared/types';
import { AgentCardShell, IdleState, ScanSteps, type AgentStatus } from '@/components/agent-card-shell';
import { cn } from '@/lib/utils';
import { DirectionBadge, ConfidenceChip, SegmentBar } from '@/components/agent-primitives';
import { DataSection, SignalBox } from './a1-card';
import { Glossed } from '@/components/lens/glossed';
import { Razonamiento } from '@/components/disclosure';
import { useLandingBeat } from '@/hooks/use-landing-beat';

interface A2CardProps {
  status: AgentStatus;
  data: A2Output | null;
  failureMessage?: string;
}

export function A2Card({ status, data, failureMessage }: A2CardProps) {
  const hasData = data != null && (status === 'done' || status === 'anomaly');
  const landNonce = useLandingBeat(status);
  return (
    <AgentCardShell
      badge="A2"
      title={<Glossed term="economia">Economía</Glossed>}
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
      {(status === 'done' || status === 'anomaly') && data && <A2Body data={data} landNonce={landNonce} />}
    </AgentCardShell>
  );
}

function A2Body({ data, landNonce }: { data: A2Output; landNonce: number }) {
  const { macro_context, factores_clave, opportunity_detected, opportunity_description, confidence, narrative } = data;
  // Nivel 3: descripción de la oportunidad + narrativa. Toggle oculto si vacío.
  const hasReasoning =
    (opportunity_detected && !!opportunity_description) || (narrative ?? '').trim().length > 0;
  return (
    <>
      {/* ── NIVEL 2 · esenciales ─────────────────────────────────────────── */}
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

      {/* Titular de oportunidad macro (señal direccional) — se queda; su prosa
          baja a nivel 3. Coherente con defaultOpen=opportunity_detected. */}
      {opportunity_detected && opportunity_description && (
        <SignalBox tone="bull">
          <div className="font-mono text-fluid-micro font-medium text-emerald uppercase tracking-wider">
            ⚡ oportunidad macro detectada
          </div>
        </SignalBox>
      )}

      {/* Titular-ancla de confianza (chrome accent) — su narrativa baja a nivel 3. */}
      <SignalBox tone={confidence >= 61 ? 'conf' : 'neut'}>
        <div
          className={cn(
            'font-mono text-fluid-micro font-medium uppercase tracking-wider',
            confidence >= 61 ? 'text-ink' : 'text-ink/66'
          )}
        >
          Economía · confianza {confidence}%
        </div>
      </SignalBox>

      {/* ── NIVEL 3 · razonamiento ───────────────────────────────────────── */}
      {hasReasoning && (
        <Razonamiento label="razonamiento" landNonce={landNonce}>
          {opportunity_detected && opportunity_description && (
            <div className="mb-2 font-mono text-fluid-caption leading-snug text-ink/80">{opportunity_description}</div>
          )}
          <div className="font-mono text-fluid-caption leading-snug text-ink/80">{narrative}</div>
        </Razonamiento>
      )}
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
