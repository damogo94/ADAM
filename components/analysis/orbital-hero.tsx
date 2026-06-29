'use client';

import { useEffect, useRef, useState } from 'react';
import type { A4Output_t as A4Output, A1Output_t, A2Output_t, A3Output_t } from '@/agents/shared/types';
import type { EstructuraOutput_t } from '@/agents/estructura/schema';
import type { ConfluenceResult } from '@/lib/confluence';
import type { AgentStatus } from '@/components/agent-card-shell';
import { normalizeDirection } from '@/components/agent-primitives';

/**
 * OrbitalHero — instrumento orbital de /analysis (sustituye al cerebro neuronal).
 *
 * Metáfora: los agentes ORBITAN el núcleo del veredicto. Al llegar su evento REAL
 * del stream se ENCIENDEN y tienden un filamento al núcleo; al resolver A4, se
 * ACOPLAN hacia el centro (asentamiento con muelle) y el núcleo enciende con la
 * fiabilidad real. Gráfico (A3) orbita AISLADO: anillo punteado propio, filamento
 * propio, SIN tether a Activo/Economía. El Debate (A1×A2, condicional) aparece como
 * una ESTACIÓN entre ambos cuando corre. Estructura es un satélite opt-in.
 *
 * INVARIANTE DE HONESTIDAD (línea roja): ningún estado encendido precede a su
 * evento real. Un satélite solo se energiza con `done`/`anomaly` (error→oscuro,
 * scanning→calibrando); el número del núcleo es asintótico (capado ~0.92) y solo
 * salta al valor real al `resolved`. Color de mercado (emerald/rose/ink) SOLO en
 * dato: número resuelto + glifo del veredicto + glifo de dirección por satélite.
 * El resto (anillos, filamentos, halos, núcleo, glow) = accent/ink (cromo).
 */

interface OrbitalHeroProps {
  running: boolean;
  resolved: boolean;
  statuses: { a1: AgentStatus; a2: AgentStatus; a3: AgentStatus };
  estructuraStatus?: AgentStatus;
  a4: A4Output | null;
  confluence: ConfluenceResult | null;
  debateStatus?: AgentStatus;
  a1?: A1Output_t | null;
  a2?: A2Output_t | null;
  a3?: A3Output_t | null;
  estructura?: EstructuraOutput_t | null;
}

type Dir = 'up' | 'down' | 'flat';
type Phase = 'idle' | 'calibrating' | 'energized' | 'dim';

const COL = { accent: '#5B8AF0', ink: '#F5F5F7', emerald: '#34D399', rose: '#FB7185' };
const dirColor = (d: Dir) => (d === 'up' ? COL.emerald : d === 'down' ? COL.rose : COL.ink);
const dirGlyph = (d: Dir) => (d === 'up' ? '▲' : d === 'down' ? '▼' : '■');

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener ? mql.addEventListener('change', h) : mql.addListener(h);
    return () => { mql.removeEventListener ? mql.removeEventListener('change', h) : mql.removeListener(h); };
  }, []);
  return reduced;
}

/** Progreso asintótico honesto: satura en ~0.92, jamás llega a 1 hasta `resolved`. */
function useAsymptoticProgress(active: boolean, resolved: boolean, reduced: boolean): number {
  const [p, setP] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (resolved) { setP(1); return; }
    if (!active) { setP(0); startRef.current = null; return; }
    if (reduced) { setP(0.5); return; }
    startRef.current = Date.now();
    const id = window.setInterval(() => {
      const t = (Date.now() - (startRef.current ?? Date.now())) / 1000;
      setP(Math.min(0.92, 1 - Math.exp(-t / 26)));
    }, 120);
    return () => window.clearInterval(id);
  }, [active, resolved, reduced]);
  return p;
}

const settled = (s?: AgentStatus) => s === 'done' || s === 'anomaly';
const phaseOf = (s?: AgentStatus): Phase =>
  s === 'error' ? 'dim' : settled(s) ? 'energized' : s === 'scanning' ? 'calibrating' : 'idle';

// ── Geometría (viewBox 400×360, núcleo en 200,160) ──
const CX = 200, CY = 160;
const R_INNER = 92, R_ISO = 132, R_DOCK = 62;
const CORE_R = 32, ARC_C = 2 * Math.PI * CORE_R;
const SAT = {
  a1: { base: -2.27, ring: R_INNER, spin: 1 },
  a2: { base: 2.27, ring: R_INNER, spin: 1 },
  est: { base: 1.571, ring: R_INNER, spin: 1 },
  a3: { base: 0.03, ring: R_ISO, spin: -1 }, // aislado, contra-rota
} as const;
type SatId = keyof typeof SAT;

interface SatFrame { present: boolean; phase: Phase; dir: Dir; }
interface Frame {
  reduced: boolean;
  running: boolean;
  resolved: boolean;
  sat: Record<SatId, SatFrame>;
  deb: { present: boolean; lit: boolean };
  targetNum: number;
  dirCore: Dir;
}

export function OrbitalHero({
  running, resolved, statuses, estructuraStatus, a4, confluence, debateStatus, a1, a2, a3, estructura,
}: OrbitalHeroProps) {
  const reduced = useReducedMotion();
  const progress = useAsymptoticProgress(running && !resolved, resolved, reduced);

  const a1Dir = normalizeDirection(a1?.anomaly_type ?? null) as Dir;
  const a2Dir = normalizeDirection(a2?.regime_outlook ?? (a2?.opportunity_detected ? 'risk_on' : null)) as Dir;
  const a3Dir = normalizeDirection(a3?.tendencia?.primaria ?? null) as Dir;
  const estRaw = estructura?.setup.direccion === 'compra' ? 'alcista'
    : estructura?.setup.direccion === 'venta' ? 'bajista' : null;
  const estDir = normalizeDirection(estRaw) as Dir;

  const actionable =
    confluence?.actionable_pct ?? confluence?.total_pct ?? a4?.confluence.score_total_pct ?? null;
  const dirCore: Dir = confluence ? (normalizeDirection(confluence.direction) as Dir) : 'flat';
  const kappaPct = confluence?.kappa != null ? Math.round(confluence.kappa * 100) : null;

  const frame = useRef<Frame>(buildFrame());
  function buildFrame(): Frame {
    return {
      reduced, running, resolved,
      sat: {
        a1: { present: true, phase: phaseOf(statuses.a1), dir: a1Dir },
        a2: { present: true, phase: phaseOf(statuses.a2), dir: a2Dir },
        a3: { present: true, phase: phaseOf(statuses.a3), dir: a3Dir },
        est: { present: !!estructuraStatus && estructuraStatus !== 'idle', phase: phaseOf(estructuraStatus), dir: estDir },
      },
      deb: { present: !!debateStatus && debateStatus !== 'idle', lit: settled(debateStatus) },
      targetNum: resolved ? (actionable ?? 0) : Math.min(92, progress * 100),
      dirCore,
    };
  }
  frame.current = buildFrame();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const numRef = useRef<HTMLDivElement | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const q = (s: string) => svg.querySelector(s) as SVGElement | null;
    const grab = (id: SatId) => ({
      g: q(`[data-node="${id}"]`), dot: q(`[data-node="${id}"] [data-dot]`),
      halo: q(`[data-node="${id}"] [data-halo]`), glyph: q(`[data-node="${id}"] [data-glyph]`),
      lbl: q(`[data-node="${id}"] [data-lbl]`),
    });
    const nodes: Record<SatId, ReturnType<typeof grab>> = { a1: grab('a1'), a2: grab('a2'), a3: grab('a3'), est: grab('est') };
    const fils: Record<string, SVGElement | null> = {
      a1: q('[data-fil="a1"]'), a2: q('[data-fil="a2"]'), a3: q('[data-fil="a3"]'),
      est: q('[data-fil="est"]'), deb: q('[data-fil="deb"]'),
    };
    const tether = q('[data-tether]');
    const stationG = q('[data-node="deb"]');
    const coreGlow = q('[data-core-glow]');
    const coreArc = q('[data-core-arc]') as SVGCircleElement | null;
    const coreGroup = q('[data-core-group]');

    const R: Record<SatId, number> = { a1: R_INNER, a2: R_INNER, a3: R_ISO, est: R_INNER };
    const vR: Record<SatId, number> = { a1: 0, a2: 0, a3: 0, est: 0 };
    let rot = 0, num = 0, numV = 0, glow = 0;
    let lastResolved = false, popStart = -1;
    let raf = 0, last = performance.now();
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      const f = frame.current;
      rot += (f.reduced ? 0 : f.resolved ? 0.04 : 0.17) * dt;
      const pos = {} as Record<SatId, { x: number; y: number; ang: number }>;

      (Object.keys(SAT) as SatId[]).forEach((id) => {
        const cfg = SAT[id], n = nodes[id], sf = f.sat[id];
        const targetR = f.resolved ? R_DOCK : cfg.ring;
        // muelle del radio (acoplamiento al resolver con leve sobre-impulso)
        const aR = (targetR - R[id]) * 26 - vR[id] * 7.2;
        vR[id] += aR * dt; R[id] += vR[id] * dt;
        if (f.reduced) { R[id] = targetR; vR[id] = 0; }
        const ang = cfg.base + (f.reduced ? 0 : rot) * cfg.spin;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const x = CX + ux * R[id], y = CY + uy * R[id];
        pos[id] = { x, y, ang };
        if (!n.g) return;
        n.g.style.opacity = sf.present ? '1' : '0';
        n.g.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)})`);
        const lit = sf.phase === 'energized';
        const pulse = sf.phase === 'calibrating' ? 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(now / 240)) : 1;
        if (n.dot) {
          n.dot.setAttribute('fill', lit ? COL.accent : sf.phase === 'dim' ? 'rgba(245,245,247,.14)' : 'rgba(245,245,247,.32)');
          n.dot.setAttribute('r', lit ? '6' : '5');
          (n.dot as SVGElement).style.opacity = String(sf.phase === 'calibrating' ? pulse : 1);
        }
        if (n.halo) (n.halo as SVGElement).style.opacity = lit ? '.9' : '0';
        if (n.glyph) {
          n.glyph.textContent = lit ? dirGlyph(sf.dir) : '';
          n.glyph.setAttribute('fill', dirColor(sf.dir));
          n.glyph.setAttribute('x', (ux * 12).toFixed(1)); n.glyph.setAttribute('y', (uy * 12 + 3).toFixed(1));
        }
        if (n.lbl) {
          (n.lbl as SVGElement).style.opacity = lit ? '1' : sf.phase === 'dim' ? '.3' : '.5';
          n.lbl.setAttribute('x', (ux * 24).toFixed(1)); n.lbl.setAttribute('y', (uy * 24 + 3.5).toFixed(1));
        }
        const fil = fils[id];
        if (fil) {
          fil.setAttribute('x1', x.toFixed(2)); fil.setAttribute('y1', y.toFixed(2));
          fil.setAttribute('x2', String(CX)); fil.setAttribute('y2', String(CY));
          (fil as SVGElement).style.opacity = (lit && sf.present) ? (f.resolved ? '.95' : '.6') : '0';
        }
      });

      const aE = f.sat.a1.phase === 'energized', eE = f.sat.a2.phase === 'energized';
      if (tether) {
        tether.setAttribute('x1', pos.a1.x.toFixed(2)); tether.setAttribute('y1', pos.a1.y.toFixed(2));
        tether.setAttribute('x2', pos.a2.x.toFixed(2)); tether.setAttribute('y2', pos.a2.y.toFixed(2));
        (tether as SVGElement).style.opacity = aE && eE ? '.5' : '.14';
      }
      const mx = (pos.a1.x + pos.a2.x) / 2, my = (pos.a1.y + pos.a2.y) / 2;
      if (stationG) {
        stationG.setAttribute('transform', `translate(${mx.toFixed(2)},${my.toFixed(2)})`);
        stationG.style.opacity = f.deb.present ? (f.deb.lit ? '1' : '.4') : '0';
      }
      if (fils.deb) {
        fils.deb.setAttribute('x1', mx.toFixed(2)); fils.deb.setAttribute('y1', my.toFixed(2));
        fils.deb.setAttribute('x2', String(CX)); fils.deb.setAttribute('y2', String(CY));
        (fils.deb as SVGElement).style.opacity = f.deb.lit ? (f.resolved ? '.9' : '.55') : '0';
      }

      // núcleo: número con muelle, arco y glow (glow accent = cromo)
      const acc = (f.targetNum - num) * 16 - numV * (2 * Math.sqrt(16) * 0.85);
      numV += acc * dt; num += numV * dt;
      if (f.reduced) { num = f.targetNum; numV = 0; }
      const shown = Math.max(0, Math.round(num));
      glow = lerp(glow, f.resolved ? 0.7 : Math.min(0.5, num / 170), 1 - Math.pow(0.002, dt));
      if (coreGlow) (coreGlow as SVGElement).style.opacity = String(glow);
      if (coreArc) coreArc.setAttribute('stroke-dasharray', `${(ARC_C * Math.min(num, 100) / 100).toFixed(1)} 999`);

      if (f.resolved && !lastResolved) popStart = now;
      lastResolved = f.resolved;
      let scale = 1;
      if (popStart >= 0 && !f.reduced) {
        const e = (now - popStart) / 520;
        if (e < 1) scale = 1 + 0.07 * Math.sin(e * Math.PI); else popStart = -1;
      }
      if (coreGroup) coreGroup.setAttribute('transform', `translate(${CX} ${CY}) scale(${scale.toFixed(3)}) translate(${-CX} ${-CY})`);

      const idle = !f.resolved && !f.running;
      if (numRef.current) {
        numRef.current.innerHTML = idle ? '—' : `${f.resolved ? '' : '~'}${shown}<span style="font-size:.42em;font-weight:600;opacity:.5">%</span>`;
        numRef.current.style.color = f.resolved ? dirColor(f.dirCore) : idle ? 'rgba(245,245,247,.6)' : COL.accent;
      }
      if (verdictRef.current) {
        if (f.resolved) {
          verdictRef.current.textContent = f.dirCore === 'up' ? 'ALCISTA' : f.dirCore === 'down' ? 'BAJISTA' : 'NEUTRAL';
          verdictRef.current.style.color = dirColor(f.dirCore);
        } else {
          verdictRef.current.textContent = idle ? 'en espera' : 'consolidando';
          verdictRef.current.style.color = 'rgba(245,245,247,.5)';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kappaTxt = resolved && kappaPct != null ? `coincidencia 0,${String(kappaPct).padStart(2, '0')}` : '';

  return (
    <div className="mx-4 mt-3 rounded-card border border-ink/10 bg-surface-2 p-4 shadow-e1 sm:mx-auto sm:max-w-[460px]" aria-live="polite">
      <div className="mb-1 inline-flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-ink/58 before:h-px before:w-[18px] before:bg-accent/80 before:content-['']">
        pipeline · {resolved ? 'resuelto' : 'consolidando'}
      </div>

      <div className="relative mx-auto w-full" style={{ maxWidth: 400 }}>
        <svg ref={svgRef} viewBox="0 0 400 360" className="block w-full" role="img"
          aria-label="Instrumento orbital: Activo y Economía orbitan el veredicto; Gráfico (A3) en un anillo aislado; el Debate aparece como estación entre Activo y Economía; al resolver, los agentes se acoplan al núcleo con la fiabilidad.">
          <circle cx={CX} cy={CY} r={R_INNER} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
          <circle cx={CX} cy={CY} r={R_ISO} fill="none" stroke="rgba(245,245,247,.12)" strokeWidth="1" strokeDasharray="3 6" />

          <line data-tether stroke="rgba(245,245,247,.18)" strokeWidth="1" style={{ opacity: 0 }} />
          <line data-fil="a1" stroke={COL.accent} strokeWidth="1.4" style={{ opacity: 0, filter: 'drop-shadow(0 0 3px rgba(91,138,240,.6))' }} />
          <line data-fil="a2" stroke={COL.accent} strokeWidth="1.4" style={{ opacity: 0, filter: 'drop-shadow(0 0 3px rgba(91,138,240,.6))' }} />
          <line data-fil="est" stroke={COL.accent} strokeWidth="1.4" style={{ opacity: 0 }} />
          <line data-fil="deb" stroke={COL.accent} strokeWidth="1.4" style={{ opacity: 0 }} />
          <line data-fil="a3" stroke="#7AA2F2" strokeWidth="1.3" strokeDasharray="2 4" style={{ opacity: 0 }} />

          <g data-core-group>
            <circle data-core-glow cx={CX} cy={CY} r="92" fill="url(#orbGlow)" style={{ opacity: 0 }} />
            <circle cx={CX} cy={CY} r={CORE_R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
            <circle data-core-arc cx={CX} cy={CY} r={CORE_R} fill="none" stroke={COL.accent} strokeWidth="3"
              strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`} strokeDasharray="0 999" style={{ opacity: 0.85 }} />
          </g>
          <defs>
            <radialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={COL.accent} stopOpacity=".5" />
              <stop offset="60%" stopColor={COL.accent} stopOpacity=".12" />
              <stop offset="100%" stopColor={COL.accent} stopOpacity="0" />
            </radialGradient>
          </defs>

          {(['a1', 'a2', 'est', 'a3'] as SatId[]).map((id) => {
            const name = id === 'a1' ? 'ACTIVO' : id === 'a2' ? 'ECONOMÍA' : id === 'est' ? 'ESTRUCTURA' : 'GRÁFICO';
            return (
              <g key={id} data-node={id} style={{ opacity: 0 }}>
                <circle data-halo r="11" fill="none" stroke={COL.accent} strokeWidth="1.5" style={{ opacity: 0 }} />
                <circle data-dot r="5" fill="rgba(245,245,247,.32)" />
                <text data-glyph textAnchor="middle" fontSize="9" fontWeight="700"></text>
                <text data-lbl textAnchor="middle" fontFamily="'IBM Plex Mono',monospace" fontSize="9"
                  letterSpacing=".06em" fill="rgba(245,245,247,.5)">{name}</text>
              </g>
            );
          })}

          <g data-node="deb" style={{ opacity: 0 }}>
            <line x1="-11" y1="0" x2="-6" y2="0" stroke={COL.accent} strokeWidth="1.4" />
            <line x1="6" y1="0" x2="11" y2="0" stroke={COL.accent} strokeWidth="1.4" />
            <rect x="-6" y="-4.5" width="12" height="9" rx="2.5" fill="rgba(91,138,240,.18)" stroke={COL.accent} strokeWidth="1.2" />
            <circle r="1.6" fill={COL.accent} />
            <text y="-9" textAnchor="middle" fontFamily="'IBM Plex Mono',monospace" fontSize="8"
              letterSpacing=".08em" fill="rgba(245,245,247,.6)">DEBATE</text>
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ transform: `translateY(-${((180 - CY) / 360 * 100).toFixed(2)}%)` }}>
          <div ref={verdictRef} className="font-mono" style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(245,245,247,.45)', height: 14 }}>en espera</div>
          <div ref={numRef} style={{ fontWeight: 800, fontSize: 48, lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: 'rgba(245,245,247,.85)' }}>—</div>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(245,245,247,.4)', marginTop: 4 }}>fiabilidad</div>
          <div className="font-mono" style={{ fontSize: 11, color: 'rgba(245,245,247,.5)', marginTop: 6, height: 14 }}>{kappaTxt}</div>
        </div>
      </div>

      {resolved && a4?.accion_sugerida ? (
        <p className="text-center font-mono text-fluid-caption leading-snug text-ink/70">{a4.accion_sugerida}</p>
      ) : (
        <p className="text-center font-mono text-fluid-caption text-ink/55">estimación · el núcleo no se completa al 100% hasta el resultado real</p>
      )}
    </div>
  );
}
