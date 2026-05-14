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
        // ─── Trading colors — única excepción ─────────────────────────
        // emerald + rose se mantienen SOLO para mini-candle chart
        // (convención global de trading: verde alza, rojo baja). Romperla
        // confunde al user pro. Cualquier OTRO uso de emerald/rose en UI
        // del producto es legacy a eliminar.
        emerald: '#10b981',
        rose: '#f43f5e',
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
        // urgPulse: era rosa para signals URGENTE. Ahora blanco — el
        // pulso sigue comunicando urgencia por intensidad, no por color.
        urgPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,255,255,0.35)' },
          '50%': { boxShadow: '0 0 0 4px rgba(255,255,255,0)' },
        },
      },
      animation: {
        sweep: 'sweep 2.2s ease-in-out infinite',
        blink: 'blink 1.1s ease-in-out infinite',
        'blink-slow': 'blink 1.6s ease-in-out infinite',
        'urg-pulse': 'urgPulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
