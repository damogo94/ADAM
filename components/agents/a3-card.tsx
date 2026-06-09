import type { A3Output_t as A3Output } from '@/agents/shared/types';
import { AgentCardShell, IdleState, type AgentStatus } from '@/components/agent-card-shell';
import { ScanCarousel } from '@/components/scan-carousel';
import { MiniCandleChart } from '@/components/mini-candle-chart';
import { DirectionBadge, ConfidenceChip, SegmentBar } from '@/components/agent-primitives';
import { cn } from '@/lib/utils';
import { DataSection, SignalBox } from './a1-card';

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

interface A3CardProps {
  status: AgentStatus;
  data: A3Output | null;
  dailyCandles?: Candle[];
  /** Moneda para mostrar junto a entrada/stop/target. Default 'USD'. */
  currency?: string;
  failureMessage?: string;
}

/**
 * A3 card — siempre visible, badge LIVE.
 * Subline recuerda: "usuario único comandante · sin contexto externo".
 */
export function A3Card({ status, data, dailyCandles, currency, failureMessage }: A3CardProps) {
  // A3 is "siempre activo" — once we have data, the dot stays as 'live'
  const dotStatus = data ? 'live' : status;
  const hasData = data != null && (status === 'done' || status === 'anomaly' || status === 'live');
  return (
    <AgentCardShell
      accent="amber"
      badge="A3"
      title="Trading · Price Action"
      status={dotStatus}
      source="Yahoo · OHLCV"
      subline="usuario · único comandante · solo gráfico"
      summary={hasData ? <A3Summary data={data} /> : undefined}
    >
      {status === 'idle' && <IdleState label="esperando activo..." />}
      {status === 'scanning' && (
        <ScanCarousel
          tasks={[
            'estructura de tendencia',
            'higher-highs / higher-lows',
            'soportes y resistencias · pivots',
            'medias móviles SMA 20/50/200',
            'detección golden cross / death cross',
            'VWAP · contexto intradía',
            'ATR · volatilidad operativa',
            'patrones de velas · doble top/bottom',
            'multi-timeframe 4H · 1D',
            'volumen · divergencias',
            'cálculo R/B ≥ 1.5',
            'componiendo narrativa A3',
          ]}
        />
      )}
      {status === 'error' && (
        <div className="py-2 space-y-1">
          <div className="font-mono text-[10px] text-rose">error en A3 — reintenta</div>
          {failureMessage && (
            <div className="font-mono text-[9px] text-white/45 leading-snug break-words">{failureMessage}</div>
          )}
        </div>
      )}
      {(status === 'done' || status === 'anomaly' || (status === 'live' && data)) && data && (
        <A3Body data={data} dailyCandles={dailyCandles} currency={currency} />
      )}
    </AgentCardShell>
  );
}

/** Fila-veredicto de A3: tendencia (dirección) + señal operativa + confianza. */
function A3Summary({ data }: { data: A3Output }) {
  const sig = data.operativa.signal;
  const sigLabel = sig === 'buy' ? 'COMPRA' : sig === 'sell' ? 'VENTA' : 'HOLD';
  return (
    <>
      <DirectionBadge dir={data.tendencia.primaria} />
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-medium text-white">
        {sigLabel} · {data.tendencia.primaria}
      </span>
      <ConfidenceChip value={data.confidence} showBar />
    </>
  );
}

function A3Body({
  data,
  dailyCandles,
  currency = 'USD',
}: {
  data: A3Output;
  dailyCandles?: Candle[];
  currency?: string;
}) {
  const { tendencia, operativa, medias, volumen, patron_detectado, narrative, confidence } = data;
  const sigCls =
    operativa.signal === 'buy' ? 'bull' : operativa.signal === 'sell' ? 'bear' : 'neut';
  const sigLabel = operativa.signal === 'buy' ? 'COMPRA' : operativa.signal === 'sell' ? 'VENTA' : 'HOLD';
  // Helper inline para mostrar precio con moneda — null/undef → guion
  const px = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(2)} ${currency}`;
  // Empty state explícito (no `—` sueltos): en hold o sin niveles no hay operativa.
  const noSetup =
    operativa.signal === 'hold' ||
    operativa.entrada === null ||
    operativa.stop_loss === null ||
    operativa.target === null;

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

      {noSetup ? (
        <div className="mb-2 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-center">
          <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-white/70">
            sin setup · hold
          </div>
          <div className="mt-0.5 font-mono text-[9px] leading-snug text-white/45">
            sin operativa con R/B suficiente ni proximidad a un nivel ahora mismo
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {/* Color semántico: stop=rose, target=emerald (convención trading global). */}
          <TechBox
            label={`ENTRADA${operativa.entry_type === 'limit' ? ' LÍMITE' : ''} · ${currency}`}
            value={px(operativa.entrada)}
            valueCls="text-white"
          />
          <TechBox label={`▼ STOP · ${currency}`} value={px(operativa.stop_loss)} valueCls="text-rose" />
          <TechBox label={`▲ OBJETIVO · ${currency}`} value={px(operativa.target)} valueCls="text-emerald" />
          <TechBox
            label="R/B RATIO"
            value={operativa.ratio_riesgo_beneficio?.toFixed(2) ?? '—'}
            valueCls="text-amber"
          />
        </div>
      )}

      <DataSection label={`Medias · ${currency}`} source={`Yahoo · ${data.timeframes_analizados.join(' · ')}`}>
        <KVRow k="MA 20" v={fmtNum(medias.sma20)} />
        <KVRow k="MA 50" v={fmtNum(medias.sma50)} />
        <KVRow
          k={`MA 200${medias.golden_cross ? ' · ⟡ Golden' : medias.death_cross ? ' · ⟡ Death' : ''}`}
          v={fmtNum(medias.sma200)}
        />
        {medias.vwap !== null && <KVRow k="VWAP" v={fmtNum(medias.vwap)} />}
      </DataSection>

      {data.osciladores && (data.osciladores.rsi14 !== null || data.osciladores.macd) && (
        <DataSection label="Osciladores" source="momentum · confirmación">
          {data.osciladores.rsi14 !== null && (
            <KVRow k={`RSI 14${rsiZone(data.osciladores.rsi14)}`} v={data.osciladores.rsi14.toFixed(1)} />
          )}
          {data.osciladores.macd && (
            <KVRow
              k={`MACD 12/26/9${data.osciladores.macd.histograma >= 0 ? ' · alza' : ' · baja'}`}
              v={`${data.osciladores.macd.line.toFixed(2)} / ${data.osciladores.macd.signal.toFixed(2)}`}
            />
          )}
        </DataSection>
      )}

      <SignalBox tone={sigCls}>
        <div
          className={cn(
            'flex items-center gap-1 font-mono text-[11px] font-medium mb-0.5 uppercase tracking-wider',
            sigCls === 'bull' && 'text-emerald',
            sigCls === 'bear' && 'text-rose',
            sigCls === 'neut' && 'text-white/55'
          )}
        >
          <span>
            señal: {sigLabel} · {tendencia.primaria}
          </span>
          {/* fuerza de tendencia como barra de segmentos (no texto "fuerte/moderada/débil"). */}
          <SegmentBar value={tendencia.fuerza} className="mx-0.5" />
          <span>· confianza {confidence}%</span>
        </div>
        <div className="font-mono text-[10px] leading-snug text-white/90">
          {patron_detectado && <span className="text-amber font-medium">{patron_detectado}</span>}
          {patron_detectado && ' — '}
          {volumen.comentario}
        </div>
        <div className="font-mono text-[9px] leading-snug text-white/55 mt-1">{narrative}</div>
      </SignalBox>
    </>
  );
}

function TechBox({ label, value, valueCls }: { label: string; value: string; valueCls?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5">
      <div className="font-mono text-[11px] uppercase tracking-wider text-white/50 mb-0.5">{label}</div>
      <div className={cn('font-mono text-[12px] font-medium', valueCls)}>{value}</div>
    </div>
  );
}

function KVRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-0.5 last:border-b-0">
      <span className="font-mono text-[10px] text-white/55">{k}</span>
      <span className="font-mono text-[10px] font-medium text-white">{v}</span>
    </div>
  );
}

function fmtNum(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function rsiZone(rsi: number): string {
  if (rsi >= 70) return ' · sobrecompra';
  if (rsi <= 30) return ' · sobreventa';
  return '';
}
