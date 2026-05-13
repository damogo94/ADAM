import type { A3Output } from '@/agents/a3/schema';
import { AgentCardShell, IdleState, ScanSteps, type AgentStatus } from '@/components/agent-card-shell';
import { MiniCandleChart } from '@/components/mini-candle-chart';
import { cn } from '@/lib/utils';
import { DataSection, SignalBox } from './a1-card';

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

interface A3CardProps {
  status: AgentStatus;
  data: A3Output | null;
  dailyCandles?: Candle[];
}

/**
 * A3 card — siempre visible, badge LIVE.
 * Subline recuerda: "usuario único comandante · sin contexto externo".
 */
export function A3Card({ status, data, dailyCandles }: A3CardProps) {
  // A3 is "siempre activo" — once we have data, the dot stays as 'live'
  const dotStatus = data ? 'live' : status;
  return (
    <AgentCardShell
      accent="amber"
      badge="A3"
      title="Trading · Price Action"
      status={dotStatus}
      source="TradingView"
      subline="usuario · único comandante · solo gráfico"
    >
      {status === 'idle' && <IdleState label="esperando activo..." />}
      {status === 'scanning' && (
        <ScanSteps
          steps={[
            { label: 'estructura de tendencia', done: false },
            { label: 'soportes y resistencias', done: false },
            { label: 'medias móviles · cruces', done: false },
            { label: 'patrones · velas · volumen', done: false },
            { label: 'gestión de posición · ATR', done: false },
          ]}
        />
      )}
      {status === 'error' && <div className="font-mono text-[10px] text-rose py-2">error en A3 — reintenta</div>}
      {(status === 'done' || status === 'anomaly' || (status === 'live' && data)) && data && (
        <A3Body data={data} dailyCandles={dailyCandles} />
      )}
    </AgentCardShell>
  );
}

function A3Body({ data, dailyCandles }: { data: A3Output; dailyCandles?: Candle[] }) {
  const { tendencia, operativa, medias, volumen, patron_detectado, narrative, confidence } = data;
  const sigCls =
    operativa.signal === 'buy' ? 'bull' : operativa.signal === 'sell' ? 'bear' : 'neut';
  const sigLabel = operativa.signal === 'buy' ? 'COMPRA' : operativa.signal === 'sell' ? 'VENTA' : 'HOLD';

  return (
    <>
      {dailyCandles && dailyCandles.length >= 5 && (
        <div className="mb-2 rounded-lg border border-white/5 bg-black/30 overflow-hidden">
          <MiniCandleChart
            candles={dailyCandles}
            entry={operativa.entrada}
            stop={operativa.stop_loss}
            target={operativa.target}
            height={140}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <TechBox label="ENTRADA" value={fmtNum(operativa.entrada)} valueCls="text-white" />
        <TechBox label="STOP LOSS" value={fmtNum(operativa.stop_loss)} valueCls="text-rose" />
        <TechBox label="OBJETIVO" value={fmtNum(operativa.target)} valueCls="text-emerald" />
        <TechBox label="R/B RATIO" value={operativa.ratio_riesgo_beneficio?.toFixed(2) ?? '—'} valueCls="text-a3" />
      </div>

      <DataSection label="Medias" source={`TradingView · ${data.timeframes_analizados.join(' · ')}`}>
        <KVRow k="MA 20" v={fmtNum(medias.sma20)} />
        <KVRow k="MA 50" v={fmtNum(medias.sma50)} />
        <KVRow
          k={`MA 200${medias.golden_cross ? ' · ⟡ Golden' : medias.death_cross ? ' · ⟡ Death' : ''}`}
          v={fmtNum(medias.sma200)}
        />
        {medias.vwap !== null && <KVRow k="VWAP" v={fmtNum(medias.vwap)} />}
      </DataSection>

      <SignalBox tone={sigCls}>
        <div className={cn('font-mono text-[8px] font-medium mb-0.5', sigCls === 'bull' ? 'text-emerald' : sigCls === 'bear' ? 'text-rose' : 'text-slate-l')}>
          señal: {sigLabel} · {tendencia.primaria} {forceFromN(tendencia.fuerza)} · confianza {confidence}/5
        </div>
        <div className="font-mono text-[10px] leading-snug text-white">
          {patron_detectado && <span className="text-a3">{patron_detectado}</span>}
          {patron_detectado && ' — '}
          {volumen.comentario}
        </div>
        <div className="font-mono text-[9px] leading-snug text-slate-l mt-1">{narrative}</div>
      </SignalBox>
    </>
  );
}

function TechBox({ label, value, valueCls }: { label: string; value: string; valueCls?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5">
      <div className="font-mono text-[7px] uppercase tracking-wider text-slate mb-0.5">{label}</div>
      <div className={cn('font-mono text-[12px] font-medium', valueCls)}>{value}</div>
    </div>
  );
}

function KVRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-0.5 last:border-b-0">
      <span className="font-mono text-[10px] text-slate-l">{k}</span>
      <span className="font-mono text-[10px] font-medium text-white">{v}</span>
    </div>
  );
}

function fmtNum(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function forceFromN(n: number): string {
  if (n >= 4) return 'fuerte';
  if (n >= 3) return 'moderada';
  return 'débil';
}
