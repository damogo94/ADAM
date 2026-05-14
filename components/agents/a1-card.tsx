import type { A1Output } from '@/agents/a1/schema';
import { AgentCardShell, IdleState, ScanSteps, type AgentStatus } from '@/components/agent-card-shell';
import { cn, fmtPct } from '@/lib/utils';

interface A1CardProps {
  status: AgentStatus;
  data: A1Output | null;
}

export function A1Card({ status, data }: A1CardProps) {
  return (
    <AgentCardShell
      accent="blue"
      badge="A1"
      title="Activos"
      status={status}
      source="Investing.com"
    >
      {status === 'idle' && <IdleState label="standby" />}
      {status === 'scanning' && (
        <ScanSteps
          steps={[
            { label: 'consultando precio · Investing.com', done: false },
            { label: 'fundamentales · ratios', done: false },
            { label: 'noticias relevantes · Bloomberg', done: false },
            { label: 'detección de anomalías', done: false },
          ]}
        />
      )}
      {status === 'error' && (
        <div className="font-mono text-[10px] text-white/65 py-2">error en A1 — reintenta</div>
      )}
      {(status === 'done' || status === 'anomaly') && data && <A1Body data={data} />}
    </AgentCardShell>
  );
}

function A1Body({ data }: { data: A1Output }) {
  const { price, fundamentals, news, anomaly_detected, anomaly_description, confidence, narrative } = data;
  const pos = price.change_pct_24h >= 0;
  return (
    <>
      <DataSection label="Precio" source="Investing.com">
        <KV k="Actual" v={price.current.toFixed(2)} />
        <KV k="24h" v={fmtPct(price.change_pct_24h)} cls={pos ? 'text-white' : 'text-white/70'} />
        <KV
          k="7d"
          v={fmtPct(price.change_pct_7d)}
          cls={price.change_pct_7d >= 0 ? 'text-white' : 'text-white/70'}
        />
        {fundamentals.per !== null && <KV k="P/E" v={fundamentals.per.toFixed(2)} />}
        {fundamentals.ev_ebitda !== null && <KV k="EV/EBITDA" v={fundamentals.ev_ebitda.toFixed(2)} />}
      </DataSection>

      {news.length > 0 && (
        <DataSection label="Noticias" source="Bloomberg">
          {news.slice(0, 3).map((n, i) => (
            <div key={i} className="border-b border-white/5 py-1 last:border-b-0">
              <div className="font-mono text-[10px] leading-snug text-white">{n.headline}</div>
              <div className="font-mono text-[8px] text-white/45">
                {n.source} ·{' '}
                <span
                  className={cn(
                    n.sentiment === 'bullish' && 'text-white',
                    n.sentiment === 'bearish' && 'text-white/85',
                    n.sentiment === 'neutral' && 'text-white/50'
                  )}
                >
                  {n.sentiment === 'bullish' ? '↑ alcista' : n.sentiment === 'bearish' ? '↓ bajista' : '→ neutral'}
                </span>
              </div>
            </div>
          ))}
        </DataSection>
      )}

      {anomaly_detected && (
        <SignalBox tone="bull">
          <div className="font-mono text-[8px] font-medium text-white mb-0.5">
            ⚡ {data.anomaly_type ?? 'anomalía'} detectada
          </div>
          <div className="font-mono text-[10px] leading-snug text-white/90">{anomaly_description}</div>
        </SignalBox>
      )}

      <SignalBox tone={confidence >= 4 ? 'bull' : 'neut'}>
        <div
          className={cn(
            'font-mono text-[8px] font-medium mb-0.5 uppercase tracking-wider',
            confidence >= 4 ? 'text-white' : 'text-white/55'
          )}
        >
          A1 · confianza {confidence}/5
        </div>
        <div className="font-mono text-[10px] leading-snug text-white/90">{narrative}</div>
      </SignalBox>
    </>
  );
}

// ─── Sub-components reused by all agent cards ────────────────────────────────

export function DataSection({ label, source, children }: { label: string; source?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-1 font-mono text-[8px] font-medium uppercase tracking-wider text-white/45">
        {label}
        {source && <span className="font-light opacity-60">· {source}</span>}
      </div>
      {children}
    </div>
  );
}

export function KV({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-0.5 last:border-b-0">
      <span className="font-mono text-[10px] text-white/55">{k}</span>
      <span className={cn('font-mono text-[10px] font-medium text-white', cls)}>{v}</span>
    </div>
  );
}

/**
 * SignalBox — caja decorada que envuelve el texto principal de un agente.
 *
 * Re-skin B&W: los tonos antes diferenciaban por hue (emerald/rose/slate).
 * Ahora se diferencian por INTENSIDAD del borde+bg:
 *
 *   - bull  → border-white/30 + bg blanco 6%   (alta visibilidad)
 *   - bear  → border-white/30 + bg blanco 6%   (alta visibilidad)
 *                                                 [igual visual que bull;
 *                                                  la diferenciación está
 *                                                  en el TEXTO/SÍMBOLO]
 *   - neut  → border-white/12 + bg blanco 2%   (dim, baja prominencia)
 *
 * En convención trading verde=alza/rojo=baja sigue dentro del mini-chart
 * de velas. Fuera de ahí: B&W estricto.
 */
export function SignalBox({ tone, children }: { tone: 'bull' | 'bear' | 'neut'; children: React.ReactNode }) {
  const cls =
    tone === 'neut'
      ? 'bg-white/[0.02] border-white/12'
      : 'bg-white/[0.06] border-white/30';
  return <div className={cn('mt-1.5 rounded-lg border px-2.5 py-1.5', cls)}>{children}</div>;
}
