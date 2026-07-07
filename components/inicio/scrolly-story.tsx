'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ScrollyStory — "De los datos al veredicto": la historia del producto contada
 * en partículas, al ritmo del scroll. Cuatro escenas que morfan una en otra:
 *
 *   01 · El ruido        una línea de precio caótica entre dispersión
 *   02 · Tres lecturas   tres constelaciones (cuentas · macro · gráfico)
 *   03 · El veredicto    el arco del dial de fiabilidad con su aguja
 *   04 · La marca        el BrandMark orbital — el cierre es el logo
 *
 * Sticky NATIVO: el scroll nunca se secuestra (se puede pasar volando) y hay
 * "Saltar la intro". Corre también en móvil con presupuesto y composición
 * propios (menos partículas; las tres lecturas se apilan en vertical; figuras
 * a escala de pantalla). Con reduced-motion o sin JS la sección no existe —
 * el contenido real vive en las secciones de abajo. El enjambre del hero se
 * funde con la escena 01.
 *
 * Estabilidad móvil: stage en 100svh (el vh dinámico de la URL bar y el
 * pinch-zoom de iOS disparan resize sin cambiar el layout — el handler solo
 * reconstruye si el tamaño REAL del canvas cambió, con debounce).
 *
 * Presupuesto /inicio: canvas 2D sin librerías, DPR≤2, IO-gating, sin hilos
 * O(N²) (solo trazos de escena), captions por DOM imperativo (cero re-renders
 * durante el scroll). Chrome ink+accent, jamás market-color.
 */
const SCENES = [
  {
    n: '01',
    label: 'EL RUIDO',
    t: 'Un activo son miles de datos moviéndose a la vez.',
    d: 'Precio, cuentas, macro — ruido hasta que alguien lo lee.',
  },
  {
    n: '02',
    label: 'TRES LECTURAS',
    t: 'Tres agentes lo leen por separado.',
    d: 'Las cuentas · la economía · el gráfico — cada uno en su carril, sin contaminarse.',
  },
  {
    n: '03',
    label: 'EL VEREDICTO',
    t: 'Convergen en un veredicto con su confianza.',
    d: 'Cuánto coinciden y cuánto fiarte — medido, no prometido.',
  },
  {
    n: '04',
    label: 'LA MARCA',
    t: 'A.D.A.M.',
    d: 'Tu copiloto de análisis. Educativo — nunca tu broker.',
  },
] as const;

const ACCENT = 'rgba(91,138,240,'; // #5B8AF0
const INK = 'rgba(245,245,247,';

export function ScrollyStory() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  if (!enabled) return null;
  return <ScrollyStage />;
}

function ScrollyStage() {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capsRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const cv = canvasRef.current;
    const capsWrap = capsRef.current;
    const label = labelRef.current;
    const hint = hintRef.current;
    if (!track || !cv || !capsWrap || !label || !hint) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const caps = Array.from(capsWrap.children) as HTMLElement[];

    // Presupuesto y composición por ancho REAL del canvas (no por media query:
    // el gate vive en el layout; aquí decide la geometría).
    let w = 0;
    let h = 0;
    let narrow = false; // <640px → figuras apiladas y a escala de pantalla
    let M = 260;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      narrow = w < 640;
      M = narrow ? 150 : 260;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // --- Generadores de escena (M objetivos cada una, semilla determinista) ---
    type Pt = { x: number; y: number };
    let scenes: Pt[][] = [];
    let gauge = { cx: 0, cy: 0, R: 0, a0: 0, a1: 0, an: 0 }; // para los trazos del dial
    let mark = { cx: 0, cy: 0, R: 0 }; // para los anillos del BrandMark

    function buildScenes() {
      let seed = 31;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

      // 01 · ruido: random-walk de precio + dispersión alrededor
      const ruido: Pt[] = [];
      const walkN = Math.floor(M * 0.72);
      let py = narrow ? h * 0.58 : h * 0.46;
      for (let i = 0; i < walkN; i++) {
        py += (rand() - 0.5) * h * 0.055;
        py = Math.max(h * (narrow ? 0.42 : 0.2), Math.min(h * (narrow ? 0.8 : 0.72), py));
        ruido.push({
          x: w * 0.08 + (i / walkN) * w * 0.84 + (rand() - 0.5) * 6,
          y: py + (rand() - 0.5) * 10,
        });
      }
      for (let i = walkN; i < M; i++) ruido.push({ x: rand() * w, y: rand() * h });

      // 02 · tres lecturas: rejilla (cuentas) · onda (macro) · barras (gráfico).
      // En ancho: las tres en la franja baja. En estrecho: apiladas en vertical
      // (una por franja), a escala de pantalla.
      const lecturas: Pt[] = [];
      const third = Math.floor(M / 3);
      const cy1 = h * 0.66;
      const gridC = narrow ? { x: w * 0.5, y: h * 0.44, s: w * 0.045 } : { x: w * 0.22, y: cy1, s: w * 0.016 };
      const waveC = narrow
        ? { x: w * 0.5, y: h * 0.62, w: w * 0.64, a: h * 0.045 }
        : { x: w * 0.5, y: cy1, w: w * 0.17, a: h * 0.06 };
      const barsC = narrow ? { x: w * 0.5, y: h * 0.8, s: w * 0.05, hh: h * 0.09 } : { x: w * 0.78, y: cy1, s: w * 0.017, hh: h * 0.13 };
      for (let i = 0; i < third; i++) {
        // rejilla 6×5 — el balance, la tabla
        const col = i % 6;
        const row = Math.floor(i / 6) % 5;
        lecturas.push({
          x: gridC.x + (col - 2.5) * gridC.s,
          y: gridC.y + (row - 2) * gridC.s,
        });
      }
      for (let i = 0; i < third; i++) {
        // onda — el ciclo macro
        const t = i / third;
        lecturas.push({
          x: waveC.x + (t - 0.5) * waveC.w,
          y: waveC.y + Math.sin(t * Math.PI * 3) * waveC.a,
        });
      }
      for (let i = lecturas.length; i < M; i++) {
        // barras verticales — el gráfico
        const k = i - third * 2;
        const bar = k % 6;
        const barH = [0.5, 0.8, 0.62, 1, 0.72, 0.88][bar]! * barsC.hh;
        lecturas.push({
          x: barsC.x + (bar - 2.5) * barsC.s,
          y: barsC.y + barsC.hh * 0.5 - (((k / 6) | 0) % 8) * (barH / 7),
        });
      }

      // 03 · veredicto: arco de dial 270° + aguja al 71% + eje
      const veredicto: Pt[] = [];
      const g = {
        cx: w * 0.5,
        cy: narrow ? h * 0.6 : h * 0.5,
        R: narrow ? w * 0.34 : Math.min(w, h) * 0.21,
        a0: Math.PI * 0.75,
        a1: Math.PI * 2.25,
        an: Math.PI * 0.75 + Math.PI * 1.5 * 0.71,
      };
      gauge = g;
      const arcN = Math.floor(M * 0.74);
      for (let i = 0; i < arcN; i++) {
        const a = g.a0 + (i / (arcN - 1)) * (g.a1 - g.a0);
        veredicto.push({ x: g.cx + Math.cos(a) * g.R, y: g.cy + Math.sin(a) * g.R });
      }
      const needleN = Math.floor(M * 0.2);
      for (let i = 0; i < needleN; i++) {
        const t = i / needleN;
        veredicto.push({
          x: g.cx + Math.cos(g.an) * g.R * 0.88 * t,
          y: g.cy + Math.sin(g.an) * g.R * 0.88 * t,
        });
      }
      for (let i = veredicto.length; i < M; i++) {
        const a = rand() * 6.28;
        veredicto.push({ x: g.cx + Math.cos(a) * 4, y: g.cy + Math.sin(a) * 4 });
      }

      // 04 · marca: BrandMark orbital — anillo exterior + interior + núcleo.
      // En estrecho sube a 0.38h: la caption va anclada abajo (ver JSX) y a
      // 0.46h el anillo se la comía en pantallas cortas.
      const marca: Pt[] = [];
      const m = { cx: w * 0.5, cy: narrow ? h * 0.38 : h * 0.46, R: narrow ? w * 0.28 : Math.min(w, h) * 0.17 };
      mark = m;
      const outN = Math.floor(M * 0.52);
      for (let i = 0; i < outN; i++) {
        const a = (i / outN) * 6.28;
        marca.push({ x: m.cx + Math.cos(a) * m.R, y: m.cy + Math.sin(a) * m.R });
      }
      const inN = Math.floor(M * 0.3);
      for (let i = 0; i < inN; i++) {
        const a = (i / inN) * 6.28;
        marca.push({ x: m.cx + Math.cos(a) * m.R * 0.6, y: m.cy + Math.sin(a) * m.R * 0.6 });
      }
      for (let i = marca.length; i < M; i++) {
        const a = rand() * 6.28;
        const rr = rand() * m.R * 0.07;
        marca.push({ x: m.cx + Math.cos(a) * rr, y: m.cy + Math.sin(a) * rr });
      }

      scenes = [ruido, lecturas, veredicto, marca];
    }
    buildScenes();

    // Pool a tamaño máximo: si M crece al rotar el dispositivo, hay partículas
    const ps: { x: number; y: number }[] = [];
    for (let i = 0; i < 260; i++) ps.push({ x: Math.random() * w, y: Math.random() * h });

    let on = false;
    const io = new IntersectionObserver((en) => {
      on = en[0]!.isIntersecting;
    });
    io.observe(track);
    // Guarda anti pinch-zoom: iOS dispara resize al hacer zoom SIN cambiar el
    // layout — reconstruir entonces descuadra las figuras. Solo actuamos si el
    // tamaño real del canvas cambió (rotación, URL bar), y con debounce.
    let rzTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(() => {
        if (Math.abs(cv.clientWidth - w) < 2 && Math.abs(cv.clientHeight - h) < 2) return;
        resize();
        buildScenes();
      }, 150);
    };
    window.addEventListener('resize', onResize);

    const smooth = (x: number) => x * x * (3 - 2 * x);
    let lastScene = -1;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!on || document.hidden) return;
      const r = track.getBoundingClientRect();
      const stageH = (track.firstElementChild as HTMLElement | null)?.clientHeight ?? window.innerHeight;
      const total = Math.max(1, r.height - stageH);
      const prog = Math.min(1, Math.max(0, -r.top / total));
      const fp = prog * 3;
      const si = Math.min(2, Math.floor(fp));
      const lt = smooth(Math.min(1, fp - si));
      const A = scenes[si]!;
      const B = scenes[si + 1]!;

      // captions + rótulo de escena (DOM imperativo: cero re-renders)
      const sceneIdx = Math.min(3, Math.round(fp));
      if (sceneIdx !== lastScene) {
        lastScene = sceneIdx;
        caps.forEach((c, k) => c.classList.toggle('scrolly-on', k === sceneIdx));
        label.textContent = `${SCENES[sceneIdx]!.n} · ${SCENES[sceneIdx]!.label}`;
      }
      hint.style.opacity = prog < 0.04 ? '1' : '0';

      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < M; i++) {
        const p = ps[i]!;
        const a = A[i]!;
        const b = B[i]!;
        const tx = a.x + (b.x - a.x) * lt;
        const ty = a.y + (b.y - a.y) * lt;
        p.x += (tx - p.x) * 0.13;
        p.y += (ty - p.y) * 0.13;
      }
      // trazos de escena (aparecen por cercanía a su escena)
      const w2 = Math.max(0, 1 - Math.abs(fp - 2)); // veredicto
      if (w2 > 0.02) {
        ctx.strokeStyle = `${ACCENT}${(0.3 * w2).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(gauge.cx, gauge.cy, gauge.R, gauge.a0, gauge.a1);
        ctx.stroke();
        ctx.strokeStyle = `${ACCENT}${(0.55 * w2).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gauge.cx, gauge.cy);
        ctx.lineTo(
          gauge.cx + Math.cos(gauge.an) * gauge.R * 0.88,
          gauge.cy + Math.sin(gauge.an) * gauge.R * 0.88,
        );
        ctx.stroke();
      }
      const w3 = Math.max(0, 1 - Math.abs(fp - 3)); // marca
      if (w3 > 0.02) {
        ctx.strokeStyle = `${ACCENT}${(0.35 * w3).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(mark.cx, mark.cy, mark.R, 0, 6.29);
        ctx.stroke();
        ctx.strokeStyle = `${ACCENT}${(0.25 * w3).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mark.cx, mark.cy, mark.R * 0.6, 0, 6.29);
        ctx.stroke();
      }
      // puntos: ink de base, accent en una fracción fija (y en la aguja/núcleo)
      for (let i = 0; i < M; i++) {
        const p = ps[i]!;
        const acc = i % 5 === 0 || (w2 > 0.5 && i >= M * 0.74) || (w3 > 0.5 && i >= M * 0.82);
        ctx.fillStyle = acc ? `${ACCENT}${0.55 + 0.35 * Math.max(w2, w3)})` : `${INK}0.5)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, acc ? 2.1 : 1.7, 0, 6.29);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rzTimer);
      io.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <section aria-label="Intro animada: de los datos al veredicto" className="relative">
      <div ref={trackRef} className="h-[280vh] md:h-[320vh]">
        <div className="sticky top-0 h-screen overflow-hidden supports-[height:100svh]:h-[100svh]">
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />

          <a
            href="#como"
            className="absolute right-5 top-16 z-10 md:right-8 md:top-20 text-[0.8125rem] text-ink/58 underline underline-offset-4 transition-colors hover:text-ink"
          >
            Saltar la intro ↓
          </a>

          {/* Captions — .scrolly-on las enciende el rAF (ver globals.css) */}
          <div ref={capsRef} aria-hidden className="pointer-events-none absolute inset-0">
            {SCENES.map((s, k) => (
              <div
                key={s.n}
                data-sc={k}
                className={
                  'scrolly-cap absolute inset-0 grid place-items-center px-6 text-center opacity-0 transition-opacity duration-300' +
                  (k < 3
                    ? ' max-md:place-items-start max-md:pt-[15vh]'
                    : // 04 en móvil: anclada abajo con hueco para el rótulo de
                      // escena (bottom-24) — el translate desde el centro se
                      // solapaba con él en pantallas cortas
                      ' max-md:place-items-end max-md:pb-40')
                }
              >
                <div className={k === 3 ? 'md:translate-y-[30vh]' : undefined}>
                  <p className="mx-auto max-w-[24ch] text-balance font-sans text-fluid-h2 font-extrabold tracking-[-0.02em] text-ink">
                    {s.t}
                  </p>
                  <p className="mx-auto mt-3 max-w-[46ch] text-fluid-lead text-ink/60">{s.d}</p>
                </div>
              </div>
            ))}
          </div>

          <p
            ref={labelRef}
            aria-hidden
            className="absolute bottom-24 left-5 md:left-8 flex items-center gap-3 font-mono text-fluid-label font-medium uppercase tracking-[0.2em] text-accent before:h-px before:w-10 before:bg-accent/60 before:content-['']"
          >
            01 · EL RUIDO
          </p>
          <p
            ref={hintRef}
            aria-hidden
            className="absolute bottom-24 left-1/2 -translate-x-1/2 font-mono text-fluid-label uppercase tracking-[0.2em] text-ink/45 transition-opacity duration-500"
          >
            Sigue bajando
          </p>
        </div>
      </div>
    </section>
  );
}
