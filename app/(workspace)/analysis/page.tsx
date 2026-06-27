'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/header';
import { AssetInput } from '@/components/asset-input';
import { SectionLabel, FlowArrow } from '@/components/section-label';
import { ConfluenceHero } from '@/components/analysis/confluence-hero';
import { A1Card } from '@/components/agents/a1-card';
import { A2Card } from '@/components/agents/a2-card';
import { A3Card } from '@/components/agents/a3-card';
import { DebateCard } from '@/components/agents/debate-card';
import { A4Card } from '@/components/agents/a4-card';
import { EstructuraCard } from '@/components/agents/estructura-card';
import { ConfluenceIndicator } from '@/components/confluence-indicator';
import { VerdictBar } from '@/components/verdict-bar';
import { RelatedRadar } from '@/components/analysis/related-radar';
import { Graticule } from '@/components/inicio/decor/graticule';
import { useRun } from '@/components/analysis/run-provider';
import { useRadar } from '@/components/analysis/radar-provider';
import { resolveTicker } from '@/lib/catalog/assets';
import { isCryptoTicker } from '@/lib/market/crypto-registry';
import { cn, getCurrencyFromTicker } from '@/lib/utils';

export default function AnalysisScreen() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-void" />}>
      <AnalysisInner />
    </Suspense>
  );
}

function AnalysisInner() {
  // El estado del run vive en el shell (RunProvider del route-group): persiste al
  // navegar al radar y volver. Esta page es solo render + auto-trigger por URL.
  const { state, estEnabled, isLoading, confluence, handleRun, toggleEstructura, fijarAlerta } = useRun();
  const { radar } = useRadar();
  const search = useSearchParams();
  const autoTicker = search.get('ticker');
  // Origen "vienes del radar" (B3): ?ticker solo NO basta (deep-links/onboarding).
  const fromRadar = search.get('from') === 'radar';
  const autoRanRef = useRef<string | null>(null);

  // Auto-trigger desde /watchlist (?ticker=X). Si el run PERSISTIDO en el shell ya
  // es de este ticker, NO se re-corre — solo se muestra (continuidad B1).
  useEffect(() => {
    if (!autoTicker) return;
    const resolved = resolveTicker(autoTicker.toUpperCase());
    if (state.ticker === resolved) {
      autoRanRef.current = autoTicker;
      return;
    }
    if (autoRanRef.current === autoTicker) return;
    autoRanRef.current = autoTicker;
    void handleRun(autoTicker.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTicker]);

  const headerStatus = state.error
    ? 'error'
    : state.a4Status === 'done'
      ? 'ok'
      : isLoading
        ? 'running'
        : 'offline';

  // Idle = aún no se ha lanzado ningún análisis y no hay error → onboarding.
  const isIdle = state.ticker === null && !state.error;

  // Puente al radar (Fase 1C·C2) — derivado del radar AMBIENTAL (RadarProvider),
  // ya NO re-fetchea: "otros activos con señal/anomalía activa" (excluye el actual).
  const related = useMemo(() => {
    if (!radar || !state.ticker) return null;
    const current = resolveTicker(state.ticker);
    const count = radar.rows.filter(
      (row) =>
        row.ticker !== current &&
        (row.signal != null ||
          row.latest?.a1_anomaly_detected ||
          row.delta.anomaly_new ||
          row.delta.direction_flipped ||
          row.delta.a3_signal_flipped)
    ).length;
    const preview = radar.digest.filter((d) => d.ticker !== current).slice(0, 3);
    return { count, preview };
  }, [radar, state.ticker]);

  return (
    <div className="min-h-screen bg-void pb-20 max-w-md mx-auto md:max-w-3xl lg:max-w-6xl xl:max-w-7xl">
      <Header status={headerStatus} />

      {/* Breadcrumb de origen (Fase 1B·B3) — solo si vienes del radar (&from=radar). */}
      {fromRadar && (
        <div className="mx-4 mt-2 font-mono text-fluid-micro">
          <Link
            href="/watchlist"
            className="inline-flex items-center gap-1 text-ink/45 underline-offset-2 transition-colors hover:text-ink/75 hover:underline"
          >
            ← vienes del radar
          </Link>
        </div>
      )}

      <AssetInput onSubmit={handleRun} disabled={isLoading} />

      {/* Agente de Estructura (futuros · MTF) — toggle opt-in para SUMAR la pata
          a la confluencia con un clic, + acceso a la pantalla dedicada. */}
      <div className="mx-4 mt-2 flex flex-wrap items-center justify-end gap-2 font-mono text-fluid-micro">
        <button
          type="button"
          onClick={toggleEstructura}
          aria-pressed={estEnabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
            estEnabled
              ? 'border-accent/60 bg-accent/10 text-accent'
              : 'border-dashed border-white/20 text-white/55 hover:border-white/35 hover:text-white/80'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors',
              estEnabled ? 'bg-accent' : 'bg-white/30'
            )}
          />
          {estEnabled ? 'Estructura activa · futuros MTF' : '+ Sumar Estructura · futuros MTF'}
        </button>
        <Link
          href="/estructura"
          className="text-white/45 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
        >
          pantalla dedicada →
        </Link>
      </div>

      {/* Barra de veredicto — lo primero que ve el usuario en cuanto A4 está listo. */}
      {state.a4 && state.a4Status === 'done' && (
        <VerdictBar a4={state.a4} confluence={confluence} aligned={confluence?.aligned ?? false} />
      )}

      {/* CTAs post-resolve (Fase 1C·C1) — acción de producto, NUNCA directiva
          compra/vende. Fijar alerta = sumar al radar (lo vigila el scanner CMT). */}
      {state.a4Status === 'done' && state.ticker && (
        <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 font-mono text-fluid-micro">
          <button
            type="button"
            onClick={fijarAlerta}
            disabled={state.alerta === 'pinning' || state.alerta === 'pinned'}
            aria-label="Fijar alerta CMT: añadir al radar para que el scanner lo vigile"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
              state.alerta === 'pinned'
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-white/20 text-white/70 hover:border-white/35 hover:text-white disabled:opacity-50'
            )}
          >
            {state.alerta === 'pinned'
              ? '✓ En tu radar'
              : state.alerta === 'pinning'
                ? 'Fijando…'
                : state.alerta === 'error'
                  ? 'Reintentar alerta'
                  : '+ Fijar alerta CMT'}
          </button>

          {!estEnabled && (
            <button
              type="button"
              onClick={toggleEstructura}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/20 px-2.5 py-1 text-white/70 transition-colors hover:border-white/35 hover:text-white"
            >
              + Sumar Estructura
            </button>
          )}

          <button
            type="button"
            onClick={() => state.ticker && void handleRun(state.ticker)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
          >
            ↻ Re-analizar
          </button>
        </div>
      )}

      {state.error && (
        <div
          className={cn(
            'mx-4 mt-3 rounded-lg border px-3 py-2.5 transition-all',
            // Errores = chrome → severidad por INTENSIDAD de blanco, no por
            // color de mercado (emerald/rose/amber reservados a datos).
            state.error.tone === 'auth' && 'border-white/15 bg-white/[0.03]',
            state.error.tone === 'transient' && 'border-white/20 bg-white/[0.05]',
            state.error.tone === 'rate_limit' && 'border-white/25 bg-white/[0.06]',
            state.error.tone === 'partial' && 'border-white/20 bg-white/[0.05]',
            state.error.tone === 'fatal' && 'border-white/40 bg-white/[0.10] animate-blink-slow'
          )}
        >
          <div
            className={cn(
              'font-sans text-fluid-caption font-bold tracking-wider mb-0.5',
              state.error.tone === 'auth' && 'text-white/75',
              state.error.tone === 'transient' && 'text-white/80',
              state.error.tone === 'rate_limit' && 'text-white/85',
              state.error.tone === 'partial' && 'text-white/80',
              state.error.tone === 'fatal' && 'text-white'
            )}
          >
            {state.error.title}
          </div>
          <div className="font-mono text-fluid-caption leading-snug text-white/85">{state.error.message}</div>
        </div>
      )}

      {state.partial && state.failures.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-white/20 bg-white/[0.05] px-3 py-2">
          <div className="font-sans text-fluid-caption font-bold tracking-wider text-white/80 mb-0.5">
            ANÁLISIS PARCIAL
          </div>
          <div className="font-mono text-fluid-caption leading-snug text-white/70">
            {state.failures.length} agente{state.failures.length > 1 ? 's' : ''} con fallo transitorio (
            {state.failures.map((f) => f.agent).join(', ')}). Confluencia degradada — reintenta para vista completa.
          </div>
        </div>
      )}

      {/* Hero de confluencia — PERSISTE de submit a resolve (Fase 1A · D1=A2):
          el núcleo CONSOLIDA durante el running y RESUELVE EN SITIO en una síntesis
          clara y GENERAL (dir + accionable + κ + conclusión de A4) al cerrar A4 —
          el cerebro y los agentes ya no desaparecen. Oculto solo en idle y error
          fatal (la caja de error manda). VerdictBar (sticky, glance) y A4 card
          (desglose) coexisten; la cifra accionable es única en las tres piezas. */}
      {state.ticker !== null && !state.error && (
        <ConfluenceHero
          running={isLoading}
          resolved={state.a4Status === 'done'}
          statuses={{ a1: state.a1Status, a2: state.a2Status, a3: state.a3Status }}
          estructuraStatus={estEnabled ? state.estructuraStatus : undefined}
          a4={state.a4}
          confluence={confluence}
          debateStatus={state.debateStatus}
          a1={state.a1}
          a2={state.a2}
          a3={state.a3}
          estructura={state.estructura}
        />
      )}

      {/* Onboarding — solo en idle (sin análisis, sin error). Rellena el hueco. */}
      {isIdle && <OnboardingCard />}

      {/* Desktop: 2 columnas — agentes (8) | rail de síntesis (4). Móvil: stack.
          En idle se oculta: el grid vacío en standby es ruido — el onboarding ya
          explica el sistema. Aparece al lanzar un ticker. */}
      <div className={cn('lg:grid lg:grid-cols-12 lg:gap-2 lg:items-start', isIdle && '!hidden')}>
        {/* Columna principal: agentes */}
        <div className="lg:col-span-8">
          {/* A1 + A2 parallel grid */}
          <SectionLabel>agentes paralelos</SectionLabel>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 px-4">
            <A1Card
              status={state.a1Status}
              data={state.a1}
              isCrypto={isCryptoTicker(state.ticker ?? '')}
              failureMessage={state.failures.find((f) => f.agent === 'A1')?.message}
            />
            <A2Card
              status={state.a2Status}
              data={state.a2}
              failureMessage={state.failures.find((f) => f.agent === 'A2')?.message}
            />
          </div>

          {/* Debate (conditional) */}
          {state.debate && (
            <>
              <FlowArrow>↓ anomalía detectada</FlowArrow>
              <SectionLabel>debate A1 × A2</SectionLabel>
              <div className="px-4">
                <DebateCard status={state.debateStatus} data={state.debate} />
              </div>
            </>
          )}

          {/* A3 always visible */}
          <SectionLabel>motor técnico autónomo</SectionLabel>
          <div className="px-4">
            <A3Card
              status={state.a3Status}
              data={state.a3}
              dailyCandles={state.dailyCandles}
              currency={state.a1?.price?.currency ?? getCurrencyFromTicker(state.ticker ?? '')}
              failureMessage={state.failures.find((f) => f.agent === 'A3')?.message}
            />
          </div>

          {/* Estructura (opt-in) — 4ª pata, también aislada (futuros · MTF). */}
          {estEnabled && (
            <>
              <FlowArrow>↓ estructura · futuros (MTF)</FlowArrow>
              <SectionLabel>agente de estructura · aislado</SectionLabel>
              <div className="px-4">
                <EstructuraCard
                  status={state.estructuraStatus}
                  data={state.estructura}
                  ticker={state.ticker}
                />
              </div>
            </>
          )}
        </div>

        {/* Rail de síntesis: confluencia + A4. En lg sube arriba a la derecha
            (sticky) en vez de quedar al final del scroll. */}
        <aside className="lg:col-span-4 lg:sticky lg:top-3">
          {/* Confluence */}
          <SectionLabel>indicador de confluencia</SectionLabel>
          <div className="px-4">
            <ConfluenceIndicator data={confluence} />
          </div>

          {/* A4 final output */}
          {state.a4 && (
            <>
              <FlowArrow>↓ output al usuario</FlowArrow>
              <SectionLabel>sistema · A4</SectionLabel>
              <div className="px-4">
                <A4Card
                  status={state.a4Status}
                  data={state.a4}
                  aligned={confluence?.aligned ?? false}
                  confluencePct={confluence?.actionable_pct ?? confluence?.total_pct}
                />
              </div>
            </>
          )}

          {/* Radar AMBIENTAL (B1·F3) — visible durante TODO el análisis (running y
              resuelto), no solo post-resolve: tu radar sigue presente, en el rail
              sticky, mientras analizas. Dato del RadarProvider compartido (F2);
              degrada silencioso (no se monta) si no hay sesión/watchlist. */}
          {related && (
            <div className="px-4 pt-3">
              <RelatedRadar count={related.count} preview={related.preview} />
            </div>
          )}
        </aside>
      </div>

      {/* Disclaimer */}
      <footer className="px-5 pt-6 text-center font-mono text-fluid-caption text-white/66 leading-relaxed">
        Análisis educativo · no constituye asesoramiento financiero regulado
      </footer>
    </div>
  );
}

/**
 * Onboarding — se muestra SOLO en idle (sin análisis lanzado, sin error).
 * Rellena el hueco vacío de la pantalla en desktop y explica el flujo en
 * 3 pasos sin jerga ni color decorativo.
 */
function OnboardingCard() {
  const steps: { n: string; t: string; d: string }[] = [
    { n: '1', t: 'Escribe un ticker', d: 'AAPL · BTC · OIL — o elígelo del catálogo ⊞' },
    {
      n: '2',
      t: 'Los agentes lo analizan',
      d: '5 agentes en paralelo — micro · macro · técnico aislado · síntesis',
    },
    {
      n: '3',
      t: 'Lees el veredicto',
      d: 'dirección + confianza consolidadas, con la confluencia entre agentes',
    },
  ];

  return (
    <section className="relative mx-4 mt-3 overflow-hidden rounded-card border border-ink/10 bg-gradient-to-b from-surface to-void px-5 py-5 shadow-e2 sm:mx-auto sm:max-w-[880px]">
      <Graticule className="opacity-70" />

      {/* Cabecera-instrumento: identidad + dial en reposo (estilo /inicio). */}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-ink/58 before:h-px before:w-[18px] before:bg-accent/80 before:content-['']">
            instrumento · en espera
          </p>
          <p className="mt-3 max-w-md text-fluid-lead leading-[1.5] text-ink/72">
            Escribe un ticker y los cinco agentes lo analizan en paralelo. El núcleo se calibra al lanzar.
          </p>
        </div>

        {/* Dial en reposo — aro + umbrales 34/67 apagados + "—". Sin dato aún. */}
        <div className="relative hidden shrink-0 sm:block" aria-hidden="true">
          <svg viewBox="0 0 104 104" width="84" height="84">
            <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(245,245,247,.10)" strokeWidth="6" />
            <line x1="85.8" y1="73.4" x2="92.5" y2="77.7" stroke="rgba(245,245,247,.20)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="17" y1="71.3" x2="9.9" y2="75.1" stroke="rgba(245,245,247,.20)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-2xl font-semibold leading-none text-ink/45">—</span>
            <span className="mt-[3px] font-mono text-[0.56rem] uppercase tracking-[0.12em] text-ink/35">en espera</span>
          </div>
        </div>
      </div>

      {/* Cómo funciona — pasos 01/02/03 */}
      <div className="relative mt-5 border-t border-ink/8 pt-4">
        <p className="mb-3 inline-flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-ink/45 before:h-px before:w-[14px] before:bg-ink/25 before:content-['']">
          cómo funciona
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-[14px] border border-ink/8 bg-ink/[0.015] px-4 py-3.5 transition-colors hover:border-ink/15"
            >
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="font-mono text-fluid-label font-semibold text-accent">0{s.n}</span>
                <span className="font-sans text-fluid-label font-semibold text-ink">{s.t}</span>
              </div>
              <p className="font-mono text-fluid-caption leading-snug text-ink/58">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
