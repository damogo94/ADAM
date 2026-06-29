'use client';

import type { EstructuraOutput_t, LecturaTimeframe_t } from '@/agents/estructura/schema';
import {
  AgentCardShell,
  IdleState,
  ScanSteps,
  type AgentStatus,
} from '@/components/agent-card-shell';
import { DirectionBadge, ConfidenceChip } from '@/components/agent-primitives';
import { Glossed } from '@/components/lens/glossed';
import { cn, getCurrencyFromTicker } from '@/lib/utils';

interface EstructuraCardProps {
  status: AgentStatus;
  data: EstructuraOutput_t | null;
  ticker?: string | null;
  failureMessage?: string;
}

const ESTADO_LABEL: Record<EstructuraOutput_t['setup']['estado'], string> = {
  listo: 'Plan listo',
  esperando_confirmacion: 'Esperando confirmación',
  esperando_zona: 'Esperando que el precio llegue',
  sin_setup: 'Aún sin plan',
  sin_estructura: 'Sin estructura clara',
};

/** compra → alcista (▲), venta → bajista (▼), ninguno → neutral (■). */
function dirToRaw(d: EstructuraOutput_t['setup']['direccion']): string {
  return d === 'compra' ? 'alcista' : d === 'venta' ? 'bajista' : 'neutral';
}

export function EstructuraCard({ status, data, ticker, failureMessage }: EstructuraCardProps) {
  const hasData = data != null && (status === 'done' || status === 'anomaly' || status === 'live');
  const currency = getCurrencyFromTicker(data?.ticker ?? ticker ?? '');

  return (
    <AgentCardShell
      accent="slate"
      badge="EST"
      title={<>Estructura · <Glossed term="mtf">Price Action MTF</Glossed></>}
      status={status}
      source="Yahoo · OHLCV"
      subline="multi-temporal · rompe y apoya · confluencia vanilla"
      summary={hasData ? <Summary data={data} /> : undefined}
      defaultOpen={data?.setup.estado === 'listo'}
    >
      {status === 'idle' && <IdleState label="esperando activo..." />}
      {status === 'scanning' && (
        <ScanSteps
          steps={[
            { label: 'contexto Weekly / Daily', done: false },
            { label: 'penúltimo y último alto/bajo', done: false },
            { label: 'rango operativo · rompe y apoya', done: false },
            { label: 'correlación de temporalidades', done: false },
            { label: 'confluencia · redondos + vanilla', done: false },
            { label: 'gatillo · M / W / ruptura', done: false },
            { label: 'gestión · SL / BE / TP · R/B', done: false },
          ]}
        />
      )}
      {status === 'error' && (
        <div className="py-2 space-y-1">
          <div className="font-mono text-fluid-caption text-ink/80">error en Estructura — reintenta</div>
          {failureMessage && (
            <div className="font-mono text-fluid-caption text-ink/66 leading-snug break-words">
              {failureMessage}
            </div>
          )}
        </div>
      )}
      {hasData && <Body data={data} currency={currency} />}
    </AgentCardShell>
  );
}

function Summary({ data }: { data: EstructuraOutput_t }) {
  return (
    <>
      <DirectionBadge dir={dirToRaw(data.setup.direccion)} />
      <span className="min-w-0 flex-1 truncate font-mono text-fluid-caption font-medium text-ink">
        {ESTADO_LABEL[data.setup.estado]}
        {data.setup.direccion !== 'ninguno' && ` · ${data.setup.direccion}`}
      </span>
      <ConfidenceChip value={data.confianza} showBar />
    </>
  );
}

function Body({ data, currency }: { data: EstructuraOutput_t; currency: string }) {
  const { contexto, rango_operativo, correlacion, confluencia, setup, gestion } = data;
  const px = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? '—' : `${v} ${currency}`;
  const hasPlan = gestion.entrada !== null && gestion.stop_loss !== null && gestion.take_profit !== null;

  return (
    <>
      {/* Estado + factor de invalidación */}
      <div className="mb-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
        <div className="font-mono text-fluid-micro font-medium uppercase tracking-wider text-ink/80">
          {ESTADO_LABEL[setup.estado]}
          {setup.timeframe_zona && ` · zona ${setup.timeframe_zona}`}
          {setup.timeframe_entrada && ` · entrada ${setup.timeframe_entrada}`}
        </div>
        <div className="mt-0.5 font-mono text-fluid-caption leading-snug text-ink/66">
          {data.factor_invalidacion}
        </div>
      </div>

      {/* Contexto multi-temporal */}
      <DataSection label="Contexto multi-temporal" source="impulso / retroceso">
        <div className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-4">
          <TfCell lectura={contexto.weekly} fallback="1W" />
          <TfCell lectura={contexto.daily} fallback="1D" />
          <TfCell lectura={contexto.h4} fallback="4H" />
          <TfCell lectura={contexto.h1} fallback="1H" />
        </div>
        <div className="mt-1.5 font-mono text-fluid-caption leading-snug text-ink/66">
          {correlacion.descripcion}
        </div>
      </DataSection>

      {/* Plan operativo (solo si hay gestión válida) */}
      {hasPlan ? (
        <div className="my-2 grid grid-cols-2 gap-1.5">
          <TechBox
            label={<><Glossed term="entrada">ENTRADA</Glossed>{gestion.entry_type === 'limit' ? ' LÍMITE' : ''} · {currency}</>}
            value={px(gestion.entrada)}
            valueCls="text-ink"
          />
          <TechBox label={<><Glossed term="stop">▼ STOP</Glossed> · {currency}</>} value={px(gestion.stop_loss)} valueCls="text-rose" />
          <TechBox label={<><Glossed term="target">▲ OBJETIVO</Glossed> · {currency}</>} value={px(gestion.take_profit)} valueCls="text-emerald" />
          <TechBox
            label={<Glossed term="rb">R/B RATIO</Glossed>}
            value={gestion.ratio_riesgo_beneficio?.toFixed(2) ?? '—'}
            valueCls="text-ink"
          />
        </div>
      ) : (
        <div className="my-2 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-center">
          <div className="font-mono text-fluid-micro font-medium uppercase tracking-wider text-ink/70">
            {setup.estado === 'esperando_zona' ? 'esperando retroceso a la zona' : 'sin plan ejecutable aún'}
          </div>
        </div>
      )}

      {/* Zona de retesteo */}
      {rango_operativo.zona_retesteo && (
        <DataSection label="Rango operativo · rompe y apoya" source={`gatillo: ${setup.gatillo}`}>
          <KVRow k="Zona de retesteo" v={px(rango_operativo.zona_retesteo.nivel)} />
          <KVRow
            k="Banda"
            v={`${rango_operativo.zona_retesteo.min} – ${rango_operativo.zona_retesteo.max}`}
          />
          {gestion.break_even_trigger !== null && (
            <KVRow k="Break-even (1R)" v={px(gestion.break_even_trigger)} />
          )}
          <div className="pt-1 font-mono text-fluid-caption leading-snug text-ink/66">
            {rango_operativo.zona_retesteo.descripcion}
          </div>
        </DataSection>
      )}

      {/* Confluencia "Eje Y" */}
      <DataSection label="Confluencia · Eje Y" source={`score ${confluencia.score}/100`}>
        <KVRow k="Precio redondo" v={confluencia.precio_redondo != null ? `${confluencia.precio_redondo} ${currency}` : '—'} />
        <KVRow
          k="Muro vanilla"
          v={
            confluencia.vanilla_disponible
              ? confluencia.barrera_vanilla != null
                ? `${confluencia.barrera_vanilla} ${currency}`
                : 'sin muro próximo'
              : 'pendiente · sin datos de opciones'
          }
        />
        <KVRow k="Setup perfecto" v={confluencia.setup_perfecto ? 'sí' : 'no'} />
        <div className="pt-1">
          <span className="block h-1 w-full overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-white/70 transition-[width] duration-500"
              style={{ width: `${confluencia.score}%` }}
            />
          </span>
        </div>
      </DataSection>

      {/* Narrativa */}
      {data.narrative && (
        <div className="mt-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 font-mono text-fluid-caption leading-snug text-ink/85">
          {data.narrative}
        </div>
      )}
    </>
  );
}

function TfCell({ lectura, fallback }: { lectura: LecturaTimeframe_t | null; fallback: string }) {
  if (!lectura) {
    return (
      <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 opacity-50">
        <div className="font-mono text-fluid-micro uppercase tracking-wider text-ink/66">{fallback}</div>
        <div className="font-mono text-fluid-caption text-ink/40">sin datos</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
      <div className="flex items-center gap-1">
        <span className="font-mono text-fluid-micro uppercase tracking-wider text-ink/66">{lectura.timeframe}</span>
        <DirectionBadge dir={lectura.direccion} className="ml-auto" />
      </div>
      <div className="font-mono text-fluid-caption font-medium text-ink/85">{lectura.direccion}</div>
      <div className="font-mono text-fluid-micro text-ink/55">{lectura.fase}</div>
    </div>
  );
}

// ─── Primitivos locales (mismo lenguaje visual que a3-card) ──────────────────

function DataSection({
  label,
  source,
  children,
}: {
  label: string;
  source?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-fluid-micro font-medium uppercase tracking-wider text-ink/70">{label}</span>
        {source && <span className="font-mono text-fluid-micro text-ink/55">{source}</span>}
      </div>
      {children}
    </div>
  );
}

function TechBox({ label, value, valueCls }: { label: React.ReactNode; value: string; valueCls?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5">
      <div className="mb-0.5 font-mono text-fluid-micro uppercase tracking-wider text-ink/66">{label}</div>
      <div className={cn('font-mono text-fluid-caption font-medium', valueCls)}>{value}</div>
    </div>
  );
}

function KVRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-0.5 last:border-b-0">
      <span className="font-mono text-fluid-caption text-ink/66">{k}</span>
      <span className="font-mono text-fluid-caption font-medium text-ink">{v}</span>
    </div>
  );
}
