import type { A1Output_t as A1Output } from '@/agents/shared/types';
import { AgentCardShell, IdleState, ScanSteps, type AgentStatus } from '@/components/agent-card-shell';
import { DirectionBadge, ConfidenceChip } from '@/components/agent-primitives';
import { cn, fmtPct, fmtMarketCap } from '@/lib/utils';

interface A1CardProps {
  status: AgentStatus;
  data: A1Output | null;
  /** Mensaje de error específico de este agente — surface al UI para diagnóstico. */
  failureMessage?: string;
  /**
   * Activo cripto: cambia las fuentes mostradas. En cripto los fundamentales
   * vienen de CoinMarketCap (∥ CoinGecko → CoinStats) y las noticias de
   * newsdata.io — Finnhub no cubre cripto. Se deriva en la página vía
   * `isCryptoTicker(ticker)` para que el label sea correcto ya en "scanning".
   */
  isCrypto?: boolean;
}

/** Tareas del carrusel "scanning" — equity (ratios) vs cripto (supply/ATH). */
const EQUITY_SCAN_TASKS = [
  'consultando precio · Yahoo',
  'volumen 24h · cambio porcentual',
  'fundamentales · ratios P/E',
  'EV/EBITDA · market cap',
  'dividendos · payout ratio',
  'noticias últimas 48h · Finnhub',
  'cruzando sentiment · headlines',
  'momentum 24h / 7d',
  'comparativa sector · peers',
  'detección de anomalías',
  'componiendo narrativa A1',
] as const;

const CRYPTO_SCAN_TASKS = [
  'consultando precio · Yahoo',
  'market cap · ranking · CoinMarketCap',
  'oferta circulante / total / máx',
  'volumen 24h · liquidez',
  'distancia al máximo histórico (ATH)',
  'momentum 24h / 7d / 30d',
  'noticias cripto · newsdata.io',
  'cruzando titulares por moneda',
  'detección de anomalías',
  'componiendo narrativa A1',
] as const;

export function A1Card({ status, data, failureMessage, isCrypto = false }: A1CardProps) {
  const hasData = data != null && (status === 'done' || status === 'anomaly');
  return (
    <AgentCardShell
      badge="A1"
      title="Activos"
      status={status}
      source={isCrypto ? 'Yahoo · CoinMarketCap · newsdata' : 'Yahoo · Finnhub'}
      summary={hasData ? <A1Summary data={data} /> : undefined}
      defaultOpen={data?.anomaly_detected ?? false}
    >
      {status === 'idle' && <IdleState label="standby" />}
      {status === 'scanning' && (
        <ScanSteps
          steps={(isCrypto ? CRYPTO_SCAN_TASKS : EQUITY_SCAN_TASKS).map((label) => ({
            label,
            done: false,
          }))}
        />
      )}
      {status === 'error' && (
        <div className="py-2 space-y-1">
          <div className="font-mono text-fluid-caption text-ink/80">error en A1 — reintenta</div>
          {failureMessage && (
            <div className="font-mono text-fluid-caption text-white/66 leading-snug break-words">{failureMessage}</div>
          )}
        </div>
      )}
      {(status === 'done' || status === 'anomaly') && data && <A1Body data={data} isCrypto={isCrypto} />}
    </AgentCardShell>
  );
}

function A1Body({ data, isCrypto }: { data: A1Output; isCrypto: boolean }) {
  const { price, fundamentals, news, anomaly_detected, anomaly_description, confidence, narrative } = data;
  const pos = price.change_pct_24h >= 0;
  const ccy = price.currency || 'USD';
  return (
    <>
      <DataSection label={`Precio · ${ccy}`} source="Yahoo">
        <KV k="Actual" v={`${price.current.toFixed(2)} ${ccy}`} />
        <KV k="24h" v={fmtPct(price.change_pct_24h)} cls={pos ? 'text-emerald' : 'text-rose'} />
        <KV
          k="7d"
          v={price.change_pct_7d === null ? 'n/d' : fmtPct(price.change_pct_7d)}
          cls={
            price.change_pct_7d === null
              ? 'text-white/66'
              : price.change_pct_7d >= 0
                ? 'text-emerald'
                : 'text-rose'
          }
        />
        {/* Market cap: clave en cripto (donde P/E y EV/EBITDA son null por
            naturaleza) y útil en equity. Ya viene en A1Output.fundamentals. */}
        {fundamentals.market_cap_usd !== null && (
          <KV k="Market cap" v={fmtMarketCap(fundamentals.market_cap_usd)} />
        )}
        {fundamentals.per !== null && <KV k="P/E" v={fundamentals.per.toFixed(2)} />}
        {fundamentals.ev_ebitda !== null && <KV k="EV/EBITDA" v={fundamentals.ev_ebitda.toFixed(2)} />}
      </DataSection>

      {news.length > 0 && (
        <DataSection label="Noticias" source={isCrypto ? 'newsdata.io' : 'Finnhub'}>
          {news.slice(0, 3).map((n, i) => (
            <div key={i} className="border-b border-white/5 py-1 last:border-b-0">
              <div className="font-mono text-fluid-caption leading-snug text-white">{n.headline}</div>
              <div className="font-mono text-fluid-caption text-white/66">
                {n.source} ·{' '}
                <span
                  className={cn(
                    n.sentiment === 'bullish' && 'text-emerald',
                    n.sentiment === 'bearish' && 'text-rose',
                    n.sentiment === 'neutral' && 'text-white/66'
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
          <div className="font-mono text-fluid-micro font-medium text-emerald mb-0.5 uppercase tracking-wider">
            ⚡ {data.anomaly_type ?? 'anomalía'} detectada
          </div>
          <div className="font-mono text-fluid-caption leading-snug text-white/95">{anomaly_description}</div>
        </SignalBox>
      )}

      <SignalBox tone={confidence >= 61 ? 'conf' : 'neut'}>
        <div
          className={cn(
            'font-mono text-fluid-micro font-medium mb-0.5 uppercase tracking-wider',
            confidence >= 61 ? 'text-ink' : 'text-ink/66'
          )}
        >
          A1 · confianza {confidence}%
        </div>
        <div className="font-mono text-fluid-caption leading-snug text-ink/90">{narrative}</div>
      </SignalBox>
    </>
  );
}

/** Fila-veredicto de A1: dirección de la anomalía + titular + confianza. */
function A1Summary({ data }: { data: A1Output }) {
  const titular = data.anomaly_detected ? (data.anomaly_type ?? 'anomalía') : 'sin señal micro';
  const dir = data.anomaly_detected ? data.anomaly_type : null;
  return (
    <>
      <DirectionBadge dir={dir} />
      <span className="min-w-0 flex-1 truncate font-mono text-fluid-caption font-medium capitalize text-white">
        {titular}
      </span>
      <ConfidenceChip value={data.confidence} showBar />
    </>
  );
}

// ─── Sub-components reused by all agent cards ────────────────────────────────

export function DataSection({ label, source, children }: { label: string; source?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-1 font-mono text-fluid-micro font-medium uppercase tracking-wider text-white/66">
        {label}
        {source && <span className="font-light opacity-70">· {source}</span>}
      </div>
      {children}
    </div>
  );
}

export function KV({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-0.5 last:border-b-0">
      <span className="font-mono text-fluid-caption text-white/66">{k}</span>
      <span className={cn('font-mono text-fluid-caption font-medium text-white', cls)}>{v}</span>
    </div>
  );
}

/**
 * SignalBox — caja decorada que envuelve el texto principal de un agente.
 *
 * FIREWALL: bull=emerald / bear=rose SOLO para SEÑAL DIRECCIONAL de mercado
 * (alza/baja, anomalía/oportunidad). Para narrativa/confianza usa `conf` →
 * neutral con filete accent (chrome), NUNCA market-color. neut = neutral plano.
 */
export function SignalBox({ tone, children }: { tone: 'bull' | 'bear' | 'neut' | 'conf'; children: React.ReactNode }) {
  const cls =
    tone === 'bull'
      ? 'bg-emerald/[0.07] border-emerald/30'
      : tone === 'bear'
        ? 'bg-rose/[0.07] border-rose/30'
        : tone === 'conf'
          ? 'bg-white/[0.02] border-white/12 border-l-2 border-l-accent/55'
          : 'bg-white/[0.02] border-white/12';
  return <div className={cn('mt-1.5 rounded-lg border px-2.5 py-1.5', cls)}>{children}</div>;
}
