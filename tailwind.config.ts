import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './agents/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // A.D.A.M. — Monochrome identity (re-skin sesión 4)
        // Identidad por TIPOGRAFÍA y SÍMBOLO, no por color.
        // Background absoluto + spectrum de blancos.
        void: '#000000', // negro absoluto, no #020610
        surface: {
          DEFAULT: '#070707',
          2: '#0a0a0a',
          3: '#101010',
        },
        // ─── Per-agent tokens — TODOS BLANCOS ─────────────────────────
        // Mantenidos por compatibilidad con código existente que usa
        // text-a1, bg-a3/15, border-a4/30, etc. La diferenciación entre
        // agentes pasa al BADGE TIPOGRÁFICO (A1/A2/A3/A4) y al SUBLINE,
        // no al color. Esto NO es deuda técnica — es decisión consciente
        // del re-skin: la identidad monocromática es load-bearing del
        // brand system.
        a1: '#ffffff',
        a2: '#ffffff',
        a3: '#ffffff',
        a4: '#ffffff',
        // ─── Color semántico (decisión sesión 5b) ─────────────────────
        // Después del re-skin B&W puro, reintroducimos un palette mínimo de
        // 3 colores para SIGNIFICADO crítico:
        //   emerald → alza · positivo · oportunidad · bullish
        //   rose    → baja · negativo · error · bearish · urgente
        //   amber   → atención · warning · pendiente confirmación
        //
        // Reglas de uso:
        //   1. NUNCA color decorativo. Solo cuando la falta de color
        //      degrade comprensión del estado (errores, precios, niveles).
        //   2. Headers, navegación, badges de identidad → siguen B&W.
        //   3. Estados neutros → white/X opacity (sin color).
        //   4. mini-candle-chart mantiene emerald/rose nativos (trading convention).
        emerald: '#10b981',
        rose: '#f43f5e',
        amber: '#f59e0b',
        // ─── Slate spectrum — secundario / disabled ───────────────────
        slate: {
          DEFAULT: '#525252', // neutral-600 — texto secundario
          l: '#a3a3a3', // neutral-400 — texto terciario / labels
        },
      },
      fontFamily: {
        // Brand / títulos / símbolos
        orbitron: ['Orbitron', 'monospace'],
        // Body
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Technical data / números / tickers
        mono: ['"IBM Plex Mono"', '"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        sweep: {
          '0%': { top: '0%', opacity: '0' },
          '4%': { opacity: '1' },
          '94%': { opacity: '1' },
          '100%': { top: '100%', opacity: '0' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.15' },
        },
        // urgPulse: ahora rose pulsing para señales URGENTE y errores fatal.
        // El color amplifica la urgencia que el solo pulso no comunica.
        urgPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(244,63,94,0.45)' },
          '50%': { boxShadow: '0 0 0 5px rgba(244,63,94,0)' },
        },
        // fadeSlideIn: entrada del item activo del carrusel de tareas
        // (scan-carousel). Fade + leve translateY de abajo a su sitio.
        // 380ms casa con la cadencia de rotación (~2.8s por tarea).
        fadeSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        sweep: 'sweep 2.2s ease-in-out infinite',
        blink: 'blink 1.1s ease-in-out infinite',
        'blink-slow': 'blink 1.6s ease-in-out infinite',
        'urg-pulse': 'urgPulse 2s ease-in-out infinite',
        'fade-slide-in': 'fadeSlideIn 380ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
