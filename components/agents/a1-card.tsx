import type { A1Output } from '@/agents/a1/schema';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';
import { ScanCarousel } from '@/components/scan-carousel';
import { cn, fmtPct } from '@/lib/utils';

interface A1CardProps {
  status: AgentStatus;
  data: A1Output | null;
  /** Mensaje de error específico de este agente — surface al UI para diagnóstico. */
  failureMessage?: string;
}

export function A1Card({ status, data, failureMessage }: A1CardProps) {
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
        <ScanCarousel
          tasks={[
            'consultando precio · Investing.com',
            'fundamentales · ratios',
            'noticias relevantes · Bloomberg',
            'detección de anomalías',
          ]}
        />
      )}
      {status === 'error' && (
        <div className="py-2 space-y-1">
          <div className="font-mono text-[10px] text-rose">error en A1 — reintenta</div>
          {failureMessage && (
            <div className="font-mono text-[9px] text-white/45 leading-snug break-words">{failureMessage}</div>
          )}
        </div>
      )}
      {(status === 'done' || status === 'anomaly') && data && <A1Body data={data} />}
    </AgentCardShell>
  );
}

function A1Body({ data }: { data: A1Output }) {
  const { price, fundamentals, news, anomaly_detected, anomaly_description, confidence, narrative } = data;
  const pos = price.change_pct_24h >= 0;
  const ccy = price.currency || 'USD';
  return (
    <>
      <DataSection label={`Precio · ${ccy}`} source="Investing.com">
        <KV k="Actual" v={`${price.current.toFixed(2)} ${ccy}`} />
        <KV k="24h" v={fmtPct(price.change_pct_24h)} cls={pos ? 'text-emerald' : 'text-rose'} />
        <KV
          k="7d"
          v={fmtPct(price.change_pct_7d)}
          cls={price.change_pct_7d >= 0 ? 'text-emerald' : 'text-rose'}
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
                    n.sentiment === 'bullish' && 'text-emerald',
                    n.sentiment === 'bearish' && 'text-rose',
                    n.sentiment === 'neutral' && 'text-white/55'
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
          <div className="font-mono text-[8px] font-medium text-emerald mb-0.5 uppercase tracking-wider">
            ⚡ {data.anomaly_type ?? 'anomalía'} detectada
          </div>
          <div className="font-mono text-[10px] leading-snug text-white/95">{anomaly_description}</div>
        </SignalBox>
      )}

      <SignalBox tone={confidence >= 61 ? 'bull' : 'neut'}>
        <div
          className={cn(
            'font-mono text-[8px] font-medium mb-0.5 uppercase tracking-wider',
            confidence >= 61 ? 'text-white' : 'text-white/55'
          )}
        >
          A1 · confianza {confidence}%
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
 * Sesión 5b: re-introducido color semántico. Bull=emerald, bear=rose,
 * neut=blanco dim. La diferenciación por hue mejora comprensión instantánea
 * de "alza vs baja" en una UI densa.
 */
export function SignalBox({ tone, children }: { tone: 'bull' | 'bear' | 'neut'; children: React.ReactNode }) {
  const cls =
    tone === 'bull'
      ? 'bg-emerald/[0.07] border-emerald/30'
      : tone === 'bear'
        ? 'bg-rose/[0.07] border-rose/30'
        : 'bg-white/[0.02] border-white/12';
  return <div className={cn('mt-1.5 rounded-lg border px-2.5 py-1.5', cls)}>{children}</div>;
}
