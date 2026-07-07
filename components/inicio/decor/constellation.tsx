'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Constellation — enjambre de calibre vivo ("la órbita es el origen").
 *
 * Dos modos:
 *  - `birth` (hero de /inicio): coreografía de carga única (~2.1s). Las
 *    partículas entran y un subconjunto ENSAMBLA el BrandMark orbital (dos
 *    anillos concéntricos + núcleo) en la franja alta del hero; el conjunto
 *    vuela encogiéndose hasta el logo de la cabecera y se emiten los eventos
 *    `adam:core-birth` (arranque) y `adam:core-docked` (aterrizaje) para que
 *    el SiteHeader haga nacer el punto del BrandMark. Después, campo vivo.
 *  - `ambient` (onboarding de /analysis): solo el campo vivo, sin coreografía.
 *
 * El campo ATRAE hacia el puntero (leve remolino) y las partículas viran a
 * accent por cercanía. Chrome, nunca market-color: ink + accent con moderación.
 *
 * Presupuesto (doctrina /inicio): canvas 2D sin librerías, DPR≤2, IO-gating,
 * listeners pasivos, semilla determinista para las casas. Con reduced-motion
 * el efecto no corre (canvas vacío y cero eventos: el logo queda estático).
 */
const ACCENT_RGB = [91, 138, 240] as const; // #5B8AF0 — token accent (SSOT tailwind)
const INK_RGB = [148, 158, 170] as const; // ink atenuado para el campo

// Hitos de la coreografía (s). El SiteHeader no depende de estos números:
// se sincroniza por eventos, no por delays duplicados.
const T_FLY0 = 1.75;
const T_FLY1 = 2.1;

function mix(k: number, alpha: number): string {
  const r = Math.round(INK_RGB[0] + (ACCENT_RGB[0] - INK_RGB[0]) * k);
  const g = Math.round(INK_RGB[1] + (ACCENT_RGB[1] - INK_RGB[1]) * k);
  const b = Math.round(INK_RGB[2] + (ACCENT_RGB[2] - INK_RGB[2]) * k);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function Constellation({
  mode = 'ambient',
  className,
}: {
  mode?: 'birth' | 'ambient';
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const host = cv.parentElement;
    if (!host) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const DESK = window.matchMedia('(min-width: 768px)').matches;
    const FINE = window.matchMedia('(pointer: fine)').matches;
    const birth = mode === 'birth';

    // Presupuesto por modo y dispositivo
    const N = birth ? (DESK ? 96 : 56) : DESK ? 46 : 30;
    const RING_A = birth ? 20 : 0; // anillo exterior del BrandMark
    const RING_B = birth ? 12 : 0; // anillo interior
    const CORE = birth ? 1 : 0; // núcleo
    const ASSEMBLY = RING_A + RING_B + CORE;
    const LINK2 = DESK ? 110 * 110 : 84 * 84;
    const R_ATTR = 160;
    const R_ATTR2 = R_ATTR * R_ATTR;
    const ease01 = (x: number) => x * x * (3 - 2 * x);

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Casas del campo: semilla determinista (mismo cielo en cada carga)
    type Home = { x: number; y: number; acc: boolean };
    let homes: Home[] = [];
    let logoT: { x: number; y: number } | null = null;
    const findLogoT = () => {
      // destino del vuelo: el núcleo del BrandMark de la cabecera
      const el = document.querySelector('[data-brand-core]');
      if (!el) {
        logoT = { x: w * 0.08, y: -24 };
        return;
      }
      const r = el.getBoundingClientRect();
      const c = cv.getBoundingClientRect();
      logoT = { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
    };
    const buildHomes = () => {
      homes = [];
      let seed = 47;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < N; i++) {
        homes.push({ x: rand() * w, y: rand() * h, acc: i < ASSEMBLY ? i % 4 === 0 : rand() < 0.16 });
      }
      if (birth) findLogoT();
    };
    buildHomes();

    // Partículas: en birth, la ensambladura nace de un halo alrededor del escenario
    const FX = () => w * 0.5;
    const FY = () => h * 0.2;
    const FR = () => Math.min(w, h) * 0.11;
    type P = { x: number; y: number; vx: number; vy: number; s: number; ph: number; prox: number };
    const pts: P[] = [];
    for (let i = 0; i < N; i++) {
      if (i < ASSEMBLY) {
        const a = Math.random() * 6.28;
        const rr = FR() * (1.7 + Math.random() * 1.5);
        pts.push({
          x: FX() + Math.cos(a) * rr,
          y: FY() + Math.sin(a) * rr,
          vx: 0,
          vy: 0,
          s: 1.6 + Math.random() * 1.1,
          ph: Math.random() * 6.28,
          prox: 0,
        });
      } else {
        pts.push({
          x: Math.random() * w,
          y: birth ? -40 - Math.random() * h * 0.5 : Math.random() * h,
          vx: 0,
          vy: 0,
          s: 1.3 + Math.random() * 1.7,
          ph: Math.random() * 6.28,
          prox: 0,
        });
      }
    }

    let mx = -9999;
    let my = -9999;
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
    };
    const onLeave = () => {
      mx = -9999;
      my = -9999;
    };
    const moveHost: HTMLElement = host;
    if (FINE) {
      moveHost.addEventListener('pointermove', onMove, { passive: true });
      moveHost.addEventListener('pointerleave', onLeave, { passive: true });
    } else {
      const onTouch = (e: TouchEvent) => {
        const r = cv.getBoundingClientRect();
        mx = e.touches[0]!.clientX - r.left;
        my = e.touches[0]!.clientY - r.top;
      };
      moveHost.addEventListener('touchmove', onTouch, { passive: true });
      moveHost.addEventListener('touchend', onLeave, { passive: true });
    }

    let on = true;
    const io = new IntersectionObserver((en) => {
      on = en[0]!.isIntersecting;
    });
    io.observe(host);
    const onResize = () => {
      resize();
      buildHomes();
    };
    window.addEventListener('resize', onResize);

    if (birth) window.dispatchEvent(new CustomEvent('adam:core-birth'));
    let dockedSent = !birth;
    let raf = 0;
    const t0 = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!on || document.hidden) return;
      const t = (now - t0) / 1000;
      const flight = !birth || t < T_FLY0 ? 0 : t < T_FLY1 ? ease01((t - T_FLY0) / (T_FLY1 - T_FLY0)) : 1;
      const acting = birth && t < T_FLY1;
      if (birth && !dockedSent && t >= T_FLY1) {
        dockedSent = true;
        window.dispatchEvent(new CustomEvent('adam:core-docked'));
      }
      // entrega al hacer scroll: el canvas se apaga y el enjambre deriva
      let sink = 0;
      if (birth) {
        const hr = host.getBoundingClientRect();
        sink = Math.min(1, Math.max(0, -hr.top / Math.max(1, hr.height * 0.85)));
        cv.style.opacity = (1 - sink).toFixed(3);
      }
      // escenario del BrandMark → destino (núcleo del logo de la cabecera)
      const cx0 = FX();
      const cy0 = FY();
      const R0 = FR();
      const cx = logoT ? cx0 + (logoT.x - cx0) * flight : cx0;
      const cy = logoT ? cy0 + (logoT.y - cy0) * flight : cy0;
      const R = R0 * (1 - flight) + 2.5 * flight;

      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < N; i++) {
        const p = pts[i]!;
        const hm = homes[i]!;
        const inAssembly = i < ASSEMBLY && acting;
        let hx: number;
        let hy: number;
        let k: number;
        if (inAssembly) {
          const wob = 2 * (1 - flight);
          if (i < RING_A) {
            const a = (i / RING_A) * 6.28;
            hx = cx + Math.cos(a) * R;
            hy = cy + Math.sin(a) * R;
          } else if (i < RING_A + RING_B) {
            const a = ((i - RING_A) / RING_B) * 6.28;
            hx = cx + Math.cos(a) * R * 0.6;
            hy = cy + Math.sin(a) * R * 0.6;
          } else {
            hx = cx;
            hy = cy;
          }
          hx += Math.sin(t * 0.9 + p.ph) * wob;
          hy += Math.cos(t * 0.8 + p.ph) * wob;
          k = 0.05 + flight * 0.04;
        } else {
          hx = hm.x + Math.sin(t * 0.4 + p.ph) * 8;
          hy = hm.y + Math.cos(t * 0.33 + p.ph) * 8;
          k = 0.015;
        }
        p.vx += (hx - p.x) * k;
        p.vy += (hy - p.y) * k;
        if (!inAssembly) {
          const dx = mx - p.x;
          const dy = my - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R_ATTR2) {
            const d = Math.sqrt(d2) || 1;
            const F = (1 - d / R_ATTR) * 0.45;
            p.vx += (dx / d) * F - (dy / d) * F * 0.3;
            p.vy += (dy / d) * F + (dx / d) * F * 0.3;
            p.prox = Math.max(p.prox, 1 - d / R_ATTR);
          }
        }
        p.prox *= 0.94;
        p.vy += sink * 0.5;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.x += p.vx;
        p.y += p.vy;
      }
      // anillos del BrandMark en formación (se desvanecen camino de la cabecera)
      const ringA = acting ? 0.5 * (1 - flight * 0.85) : 0;
      if (ringA > 0.01) {
        ctx.strokeStyle = `rgba(${ACCENT_RGB[0]},${ACCENT_RGB[1]},${ACCENT_RGB[2]},${ringA})`;
        ctx.lineWidth = 1.4;
        for (let i = 0; i < RING_A; i++) {
          const a = pts[i]!;
          const b = pts[(i + 1) % RING_A]!;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${ACCENT_RGB[0]},${ACCENT_RGB[1]},${ACCENT_RGB[2]},${ringA * 0.7})`;
        for (let i = 0; i < RING_B; i++) {
          const a = pts[RING_A + i]!;
          const b = pts[RING_A + ((i + 1) % RING_B)]!;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      // hilos del campo (la ensambladura no teje mientras actúa: geometría limpia)
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        if (acting && i < ASSEMBLY) continue;
        for (let j = i + 1; j < N; j++) {
          if (acting && j < ASSEMBLY) continue;
          const a = pts[i]!;
          const b = pts[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK2) {
            ctx.strokeStyle = `rgba(245,245,247,${(0.07 * (1 - d2 / LINK2)).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (let i = 0; i < N; i++) {
        const p = pts[i]!;
        const hm = homes[i]!;
        const inAssembly = i < ASSEMBLY && acting;
        const isCore = inAssembly && i === ASSEMBLY - 1;
        const acc = inAssembly || hm.acc;
        const g = p.prox;
        const size = p.s + g * 0.8 + (isCore ? 1.6 : inAssembly ? 0.6 : 0);
        const alpha = Math.min(1, (inAssembly ? 0.92 : acc ? 0.8 : 0.45) + g * 0.3);
        ctx.fillStyle = acc
          ? `rgba(${ACCENT_RGB[0]},${ACCENT_RGB[1]},${ACCENT_RGB[2]},${alpha})`
          : mix(g, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, 6.29);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      moveHost.removeEventListener('pointermove', onMove);
      moveHost.removeEventListener('pointerleave', onLeave);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  );
}
