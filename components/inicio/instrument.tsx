'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { SCENARIOS, type Scenario } from './example';
import { changeTone, toneFor } from './lib/tone';
import { capitalize, formatChange, formatKappa, formatPrice } from './lib/format';
import { Gauge } from './gauge';
import { KappaRule } from './kappa-rule';
import { ConvergenceLayer } from './convergence-layer';

/**
 * Instrument — el HÉROE manipulable de /inicio. La verdict card deja de ser
 * estática: conmutas Coinciden/Discrepan/Señal débil (tablist accesible) y ves
 * recalibrarse la confianza accionable, el gauge, κ y las lentes EN VIVO —
 * onboarding del modelo |net|·f(κ) por manipulación directa.
 *
 * FIREWALL: todo color de mercado (arco, dirección, κ, marcador, panel) deriva
 * de VERDICT_TONE vía `toneFor()`; el chrome (tablist, chip, spotlight, bordes)
 * es void/surface/ink + accent. El fondo/borde del panel de veredicto se DERIVA
 * del tono en cada render (no hardcode) → Discrepan vira a su tono, sin fondo
 * emerald fósil.
 *
 * A11y: tablist con roving tabindex + flechas + Home/End; un único sr-only
 * aria-live con resumen curado (no el diff entero); gauge aria-hidden con valor
 * en texto. reduced-motion respetado por Gauge/KappaRule y por motion-safe:*.
 */
const TAB_ID = (i: number) => `inst-tab-${i}`;
const PANEL_ID = 'inst-panel';

/**
 * Spotlight + tilt 3D bajo el puntero — materialidad de "objeto bajo una
 * lámpara". Un único listener pasivo, rAF, sin estado de React. Off en touch y
 * en reduced-motion. Escribe CSS vars: --mx/--my (foco) y --rx/--ry (inclinación
 * ≤3,2°). El return suave se hace con la transición que aplica el handler.
 */
const TILT_MAX = 2;

function useSpotlightTilt() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia('(pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduce.matches) return;

    let raf = 0;
    let cx = 0;
    let cy = 0;
    const onMove = (e: PointerEvent) => {
      cx = e.clientX;
      cy = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const px = (cx - r.left) / r.width;
        const py = (cy - r.top) / r.height;
        el.style.setProperty('--mx', `${cx - r.left}px`);
        el.style.setProperty('--my', `${cy - r.top}px`);
        el.style.setProperty('--ry', `${(px - 0.5) * 2 * TILT_MAX}deg`);
        el.style.setProperty('--rx', `${-(py - 0.5) * 2 * TILT_MAX}deg`);
      });
    };
    const enter = () => {
      el.style.setProperty('--spot', '1');
      el.style.transition = 'transform 120ms ease-out';
    };
    const leave = () => {
      el.style.setProperty('--spot', '0');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.transition = 'transform 400ms ease-out';
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

function IllustrativeTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/[0.08] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-amber',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
      Ejemplo ilustrativo
    </span>
  );
}

function Lens({
  lens,
  onHover,
}: {
  lens: Scenario['lenses'][number];
  onHover?: (hovered: boolean) => void;
}) {
  return (
    <div
      data-conv="lens"
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
      className={cn(
        'flex min-h-[9.5rem] flex-col bg-surface px-4 py-4 transition-colors',
        lens.isolated && 'iso-stripe',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded border px-1.5 py-px font-mono text-[0.72rem] font-bold tracking-wider text-ink/72',
            lens.isolated ? 'border-dashed border-ink/30' : 'border-ink/15',
          )}
        >
          {lens.tag}
        </span>
        <span className="font-mono text-[0.66rem] uppercase tracking-[0.1em] text-ink/58">
          {lens.label}
        </span>
        {lens.isolated ? (
          <span className="ml-auto rounded border border-dashed border-ink/30 px-1 py-px font-mono text-[0.56rem] font-bold uppercase tracking-[0.08em] text-ink/58">
            aislado
          </span>
        ) : (
          <span className="ml-auto font-mono text-[0.62rem] text-ink/45">conf. {lens.confidence}</span>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {lens.points.map((p) => (
          <div key={p.k} className="flex items-baseline gap-1.5">
            <dt className="font-mono text-[0.6rem] uppercase tracking-[0.06em] text-ink/45">{p.k}</dt>
            <dd className="font-mono text-[0.78rem] text-ink">{p.v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 line-clamp-3 text-[0.8rem] leading-relaxed text-ink/72">{lens.line}</p>

      {/* Barra de confianza del agente (0-100). Color = accent (marca/UI), no
          market-color: la confianza no es dato de mercado (firewall). */}
      <div className="mt-auto flex items-center gap-2 pt-3">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10">
          <span
            className="block h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-precise"
            style={{ width: `${lens.confidence}%` }}
          />
        </span>
        <span className="font-mono text-[0.62rem] text-ink/72">{lens.confidence}</span>
      </div>
    </div>
  );
}

interface Delta {
  kFrom: number;
  kTo: number;
  aFrom: number;
  aTo: number;
}

export function Instrument() {
  const [active, setActive] = useState(0);
  const [recalc, setRecalc] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [delta, setDelta] = useState<Delta | null>(null);
  const scn = SCENARIOS[active]!;
  const v = scn.verdict;
  const tone = toneFor(v.direccion);
  const change = formatChange(scn.price.change_pct_24h);
  const chgTone = changeTone(change.positive);
  const dirLabel = v.direccion_label ?? capitalize(v.direccion);
  const lowKappa = v.kappa < 0.5;

  const cardRef = useSpotlightTilt();
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const prevVerdict = useRef({ k: v.kappa, a: v.actionable_pct });

  // G · "qué cambió": al conmutar, anuncia el delta de κ/confianza ~3,5s.
  useEffect(() => {
    const prev = prevVerdict.current;
    prevVerdict.current = { k: v.kappa, a: v.actionable_pct };
    if (prev.k === v.kappa && prev.a === v.actionable_pct) return;
    setDelta({ kFrom: prev.k, kTo: v.kappa, aFrom: prev.a, aTo: v.actionable_pct });
    const t = setTimeout(() => setDelta(null), 3500);
    return () => clearTimeout(t);
  }, [active, v.kappa, v.actionable_pct]);

  function selectTab(i: number, focus = true) {
    setActive(i);
    if (focus) tabsRef.current[i]?.focus();
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const n = SCENARIOS.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectTab((i + 1) % n);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectTab((i - 1 + n) % n);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectTab(n - 1);
    }
  }

  // I · atajos: 1/2/3 conmutan, R recalcula. Solo activos con el foco DENTRO del
  // instrumento (bubbling desde tabs/botón) → cumple WCAG 2.1.4.
  function onShortcut(e: React.KeyboardEvent) {
    if (e.key >= '1' && e.key <= String(SCENARIOS.length)) {
      e.preventDefault();
      selectTab(Number(e.key) - 1, false);
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      setRecalc((r) => r + 1);
    }
  }

  return (
    <div className="w-full" onKeyDown={onShortcut}>
      {/* sr-only live region: resumen curado, NO el diff entero */}
      <span className="sr-only" aria-live="polite">
        {`${scn.ticker}: ${tone.word}, fiabilidad ${v.actionable_pct} sobre 100, coincidencia ${v.confianza}.`}
      </span>

      {/* Conmutador de escenarios — tablist accesible */}
      <div
        role="tablist"
        aria-label="Escenarios de ejemplo"
        className="mb-3 inline-flex max-w-full flex-wrap gap-1 rounded-full border border-ink/10 bg-surface-2 p-1"
      >
        {SCENARIOS.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              role="tab"
              id={TAB_ID(i)}
              aria-selected={on}
              aria-controls={PANEL_ID}
              tabIndex={on ? 0 : -1}
              onClick={() => selectTab(i, false)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                'min-h-[44px] rounded-full px-3.5 font-mono text-[0.74rem] font-semibold tracking-[0.03em] transition-colors',
                on ? 'bg-surface-3 text-ink shadow-e1' : 'text-ink/58 hover:text-ink',
              )}
            >
              {s.tabLabel}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {delta ? (
          <p aria-hidden className="font-mono text-[0.8rem] text-accent">
            κ {formatKappa(delta.kFrom)} → {formatKappa(delta.kTo)} · confianza {delta.aFrom} →{' '}
            {delta.aTo}
          </p>
        ) : (
          <p className="font-mono text-[0.8rem] text-ink/58">{scn.hint}</p>
        )}
        <span
          aria-hidden
          className="hidden font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink/40 sm:inline"
        >
          1·2·3 escenarios · R recalcular
        </span>
      </div>

      {/* La card / instrumento — tilt 3D bajo el puntero (vars --rx/--ry) */}
      <div
        ref={cardRef}
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={TAB_ID(active)}
        className="relative overflow-hidden rounded-card border border-ink/10 bg-gradient-to-b from-surface to-void shadow-e3 edge-hi"
        style={{
          transform: 'perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))',
          willChange: 'transform',
        }}
      >
        {/* spotlight de puntero — accent, confinado a la card (off en touch/RM) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-[var(--spot,0)] transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(200px circle at var(--mx,50%) var(--my,50%), rgba(91,138,240,0.10), transparent 70%)',
          }}
        />

        {/* convergencia de las tres lentes → veredicto (accent, hace literal κ) */}
        <ConvergenceLayer
          cardRef={cardRef}
          active={active}
          kappa={v.kappa}
          replay={recalc}
          highlight={hovered}
        />

        <div className="relative z-10">
          {/* top: ticker + precio */}
          <div className="flex items-center gap-3 border-b border-ink/10 px-5 py-4">
            <span className="rounded-md border border-ink/15 bg-surface-2 px-2.5 py-1 font-mono text-[1.05rem] font-semibold tracking-[0.12em]">
              {scn.ticker}
            </span>
            <span className="ml-auto text-right font-mono">
              <span className="block text-[1.05rem] font-semibold text-ink">
                {formatPrice(scn.price.current)}{' '}
                <span className="font-normal text-ink/58">{scn.price.currency}</span>
              </span>
              <span className={cn('block text-[0.8rem]', chgTone.text)}>
                {change.glyph} {change.label} hoy
              </span>
            </span>
            <IllustrativeTag className="ml-2 hidden sm:inline-flex" />
          </div>

          {/* discordancia (κ baja) — accent, NO rose; altura reservada (sin CLS) */}
          <div
            aria-hidden={!lowKappa}
            className={cn(
              'flex items-center gap-2 px-5 pt-3 transition-opacity duration-300',
              lowKappa ? 'opacity-100' : 'opacity-0',
            )}
          >
            <span className="h-px flex-1 bg-accent/40" />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-accent">
              lecturas sin acuerdo
            </span>
            <span className="h-px flex-1 bg-accent/40" />
          </div>

          {/* las tres lentes */}
          <div className="grid grid-cols-1 gap-px bg-ink/10 sm:grid-cols-3">
            {scn.lenses.map((lens, i) => (
              <Lens key={lens.tag} lens={lens} onHover={(h) => setHovered(h ? i : null)} />
            ))}
          </div>

          {/* veredicto — fondo/borde DERIVADOS del tono (firewall por construcción) */}
          <div className={cn('border-t px-5 py-5', tone.panelBorder, tone.panelBg)}>
            <div className="flex items-center gap-5">
              <span data-conv="gauge">
                <Gauge
                  value={v.actionable_pct}
                  hex={tone.hex}
                  replay={recalc}
                  restless={v.actionable_pct < 40}
                />
              </span>
              <div className="min-w-0">
                <span className={cn('inline-flex items-center gap-2 text-[1.2rem] font-bold tracking-tight', tone.text)}>
                  <span aria-hidden="true">{tone.glyph}</span>
                  {dirLabel}
                </span>
                <p className="mt-1 text-[0.9rem] leading-relaxed text-ink/72">{v.porque}</p>
              </div>
            </div>

            <div className="mt-5">
              <KappaRule
                kappa={v.kappa}
                markerClass={tone.marker}
                zoneClass={tone.zoneFill}
                replay={recalc}
              />
            </div>

            {/* micro-readout de la ecuación + prueba determinista [recalcular] */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="font-mono text-[0.7rem] leading-relaxed text-ink/45">
                <span className="text-ink/58">modelo</span> · fiabilidad ={' '}
                <span className="text-ink/45">|net|</span> · f(κ{' '}
                <span className="text-ink/72">{formatKappa(v.kappa)}</span>) ={' '}
                <span className={cn('font-semibold', tone.text)}>{v.actionable_pct}</span>
              </p>
              <button
                type="button"
                onClick={() => setRecalc((r) => r + 1)}
                aria-label="Recalcular con los mismos datos — el resultado es idéntico"
                title="Mismos datos → mismo resultado"
                className="group inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-ink/15 bg-surface-2 px-2.5 font-mono text-[0.64rem] uppercase tracking-[0.06em] text-ink/58 transition-colors hover:border-ink/25 hover:text-ink"
              >
                <span aria-hidden="true" className="transition-transform duration-500 group-hover:rotate-180">
                  ↻
                </span>
                recalcular
              </button>
            </div>
            <span className="sr-only" aria-live="polite">
              {recalc > 0
                ? `Recalculado con los mismos datos: fiabilidad ${v.actionable_pct}, idéntico.`
                : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
