/**
 * ArchitectureDiagram — diagrama del pipeline real de A.D.A.M.
 *
 * Rediseño 2026-06 (verdict-first / responsive): layout por ZONAS en HTML+Tailwind
 * en vez de un SVG de viewBox fijo, para que apile en vertical y sea legible en
 * móvil. Codificación visual por TIPO de nodo (dato / compute / agente / debate /
 * persistencia), no solo por texto.
 *
 * Refleja el flujo REAL del código (fuente de verdad: agents/pipeline.ts,
 * lib/market/snapshot.ts, lib/anthropic.ts):
 *   - Datos: OHLCV = SOLO Yahoo (velas) · quote Yahoo→Finnhub · Finnhub fund/news
 *     · FRED macro. (No "Finnhub→Yahoo": eso era incorrecto.)
 *   - A3 AISLADO: su único input es computeTechnical(OHLCV). SIN aristas de
 *     noticias/macro. Es el rasgo más importante del diagrama → divisor explícito.
 *   - Debate: SOLO A1×A2, condicional. A3 NO participa.
 *   - A4 = Haiku (narrate) sobre computeConfluence; cita A3 verbatim.
 *   - CMT scanner: subsistema AUTÓNOMO (cron watchlist-scan → signals_history),
 *     desconectado del flujo usuario→salida.
 *
 * Modelos (ADR-001): A1 Haiku · A2 Sonnet · A3 Haiku · A4 Haiku · Debate Sonnet.
 */

type NodeKind = 'io' | 'data' | 'compute' | 'agent' | 'agentIsolated' | 'debate' | 'persist';
type Accent = 'a1' | 'a2' | 'a3' | 'a4' | 'slate';

const ACCENT: Record<Accent, string> = {
  a1: 'border-a1/55 bg-a1/[0.08]',
  a2: 'border-a2/55 bg-a2/[0.08]',
  a3: 'border-white/90 bg-white/[0.08] border-dashed', // aislado → contorno blanco fuerte
  a4: 'border-a4/55 bg-a4/[0.08]',
  slate: 'border-slate/40 bg-slate/10',
};

const KIND: Record<Exclude<NodeKind, 'agent' | 'agentIsolated'>, string> = {
  io: 'border-white/60 bg-white/[0.06]',
  data: 'border-white/15 bg-white/[0.02]',
  compute: 'border-emerald/55 bg-emerald/[0.06]',
  debate: 'border-white/25 border-dashed bg-white/[0.02]',
  persist: 'border-a4/40 bg-a4/[0.05]',
};

function Node({
  kind,
  accent = 'slate',
  title,
  sub,
  tag,
  className,
}: {
  kind: NodeKind;
  accent?: Accent;
  title: string;
  sub?: string;
  /** Etiqueta destacada (ej. "AISLADO", "sin LLM"). */
  tag?: string;
  className?: string;
}) {
  const tone =
    kind === 'agent' || kind === 'agentIsolated' ? ACCENT[accent] : KIND[kind];
  const titleCls =
    kind === 'compute' ? 'text-emerald' : 'text-white';
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${tone} ${className ?? ''}`}>
      <div className="flex items-center gap-1">
        <span className={`font-mono text-[10px] font-medium leading-tight ${titleCls}`}>{title}</span>
        {tag && (
          <span className="ml-auto rounded bg-white/15 px-1 py-px font-mono text-[7px] font-bold uppercase tracking-wider text-white/80">
            {tag}
          </span>
        )}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[8px] leading-snug text-white/45">{sub}</div>}
    </div>
  );
}

/** Banda de zona con etiqueta a la izquierda (apila en móvil). */
function Zone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-stretch sm:gap-2">
      <div className="flex-shrink-0 pt-1 font-orbitron text-[7px] font-bold uppercase tracking-[0.15em] text-white/30 sm:w-16">
        {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Conector vertical entre zonas. */
function FlowDown() {
  return (
    <div className="flex justify-center py-0.5 sm:pl-16" aria-hidden="true">
      <span className="font-mono text-[11px] leading-none text-white/30">↓</span>
    </div>
  );
}

export function ArchitectureDiagram() {
  return (
    <div className="rounded-[15px] border border-white/5 bg-black/40 p-3">
      <div className="mb-3 font-mono text-[8px] uppercase tracking-wider text-white/40">
        pipeline · compute (determinístico) + narrate (LLM)
      </div>

      <div className="flex flex-col">
        {/* 1 · INPUT */}
        <Zone label="Input">
          <Node kind="io" title="Usuario · ticker" sub="POST /api/agents/run" />
        </Zone>
        <FlowDown />

        {/* 2 · DATOS — repartidos por destino para que se lea el fan-out */}
        <Zone label="Datos">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto_minmax(0,12rem)]">
            <div className="flex flex-col gap-1.5">
              <Node kind="data" title="Finnhub" sub="fundamentales · noticias · (quote fallback)" />
              <Node kind="data" title="FRED" sub="macro (cache Supabase)" />
            </div>
            <IsolationDivider />
            <Node kind="data" title="Yahoo" sub="OHLCV daily + 1h · quote (primario)" tag="A3" />
          </div>
        </Zone>
        <FlowDown />

        {/* 3 · NARRATE — fan-out; A3 físicamente aislado a la derecha */}
        <Zone label="Narrate">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto_minmax(0,12rem)]">
            {/* narrativos: reciben contexto (news/macro/fundamentales) */}
            <div className="flex flex-col gap-1.5">
              <Node kind="agent" accent="a1" title="A1 · Activos" sub="micro · fund + noticias · Haiku" />
              <Node kind="agent" accent="a2" title="A2 · Macro" sub="ciclo · tipos · inflación · Sonnet" />
            </div>
            <IsolationDivider />
            {/* A3: SOLO OHLCV → compute → narrate. Sin aristas de news/macro. */}
            <div className="flex flex-col gap-1.5">
              <Node kind="compute" title="computeTechnical" sub="SMA·EMA·ATR·RSI·MACD·niveles" tag="sin LLM" />
              <Node
                kind="agentIsolated"
                accent="a3"
                title="A3 · Price action"
                sub="solo OHLCV · Haiku"
                tag="aislado"
              />
            </div>
          </div>
        </Zone>
        <FlowDown />

        {/* 4 · DEBATE — solo A1×A2 (A3 no participa) */}
        <Zone label="Debate">
          <div className="sm:max-w-[60%]">
            <Node
              kind="debate"
              title="Debate A1 × A2"
              sub="condicional · si A1 anomalía o A2 oportunidad · A3 NO participa"
            />
          </div>
        </Zone>
        <FlowDown />

        {/* 5 · CONFLUENCIA — fan-in determinístico */}
        <Zone label="Confluencia">
          <Node
            kind="compute"
            title="computeConfluence"
            sub="30/40/30 · A1/A2[+debate] + A3 · capping por agentes vivos"
            tag="sin LLM"
          />
        </Zone>
        <FlowDown />

        {/* 6 · OUTPUT — A4 */}
        <Zone label="Output">
          <Node kind="agent" accent="a4" title="A4 · ensamblado" sub="cita A3 verbatim · disclaimer literal · Haiku" />
        </Zone>
        <FlowDown />

        {/* 7 · PERSISTENCIA / UI */}
        <Zone label="Persiste">
          <Node kind="persist" title="Supabase · analyses_log" sub="→ render UI /analysis" />
        </Zone>
      </div>

      {/* Subsistema AUTÓNOMO — desconectado del flujo usuario→salida */}
      <div className="mt-3 border-t border-dashed border-white/10 pt-2.5">
        <div className="mb-1.5 font-mono text-[8px] uppercase tracking-wider text-white/35">
          subsistema autónomo · independiente del análisis
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Node kind="data" title="cron · watchlist-scan" sub="programado" className="flex-1 min-w-[7rem]" />
          <span className="font-mono text-[11px] text-white/30" aria-hidden="true">→</span>
          <Node kind="compute" title="CMT scanner" sub="computeTechnical · sin LLM" className="flex-1 min-w-[6rem]" />
          <span className="font-mono text-[11px] text-white/30" aria-hidden="true">→</span>
          <Node kind="persist" title="signals_history" className="flex-1 min-w-[6rem]" />
        </div>
      </div>

      {/* Módulo INDEPENDIENTE · Agente de Estructura — disparado por el usuario
          (POST /api/agents/estructura), fuera del pipeline runADAM. Aislado con
          su propio guard, igual que A3. */}
      <div className="mt-3 border-t border-dashed border-white/10 pt-2.5">
        <div className="mb-1.5 font-mono text-[8px] uppercase tracking-wider text-white/35">
          agente de estructura · módulo independiente · price action multi-temporal
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Node kind="data" title="Yahoo · futuros" sub="OHLCV 1D+1h · GC=F · NQ=F" tag="EST" className="flex-1 min-w-[7rem]" />
          <span className="font-mono text-[11px] text-white/30" aria-hidden="true">→</span>
          <Node kind="compute" title="computeEstructura" sub="Weekly/Daily/H4/H1 · rompe y apoya · redondos + vanilla" tag="sin LLM" className="flex-1 min-w-[8rem]" />
          <span className="font-mono text-[11px] text-white/30" aria-hidden="true">→</span>
          <Node kind="agentIsolated" accent="a3" title="narrate · Estructura" sub="Haiku · guard propio" tag="aislado" className="flex-1 min-w-[6rem]" />
          <span className="font-mono text-[11px] text-white/30" aria-hidden="true">→</span>
          <Node kind="io" title="/estructura" sub="render UI" className="flex-1 min-w-[5rem]" />
        </div>
      </div>

      {/* Leyenda por tipo de nodo */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/5 pt-2 font-mono text-[7px] text-white/55">
        <LegendDot className="border-emerald/55 bg-emerald/[0.06]" label="compute · sin LLM" />
        <LegendDot className="border-white/90 border-dashed bg-white/[0.08]" label="A3 aislado · solo OHLCV" />
        <LegendDot className="border-white/25 border-dashed bg-white/[0.02]" label="condicional (debate)" />
        <LegendDot className="border-a4/40 bg-a4/[0.05]" label="persistencia" />
      </div>
    </div>
  );
}

/** Divisor vertical que materializa el aislamiento de A3 (oculto al apilar en móvil). */
function IsolationDivider() {
  return (
    <div className="hidden flex-col items-center justify-center sm:flex" aria-hidden="true">
      <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/25 to-transparent" />
      <span className="my-1 rotate-180 font-mono text-[6px] uppercase tracking-widest text-white/30 [writing-mode:vertical-rl]">
        aislado
      </span>
      <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/25 to-transparent" />
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-sm border ${className}`} />
      {label}
    </span>
  );
}
