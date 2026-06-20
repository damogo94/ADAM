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
        // ───────────────────────────────────────────────────────────────
        // A.D.A.M. — "Instrumento de precisión" (re-skin 2026)
        //
        // Dirección NUEVA, reemplaza al re-skin "monochrome identity" previo:
        // el blanco/negro puro confundía a usuarios reales y no era cómodo.
        // Ahora: neutro oscuro premium + UN acento de marca frío + semántica
        // de mercado RESERVADA. La identidad ya no es el contraste B&W, sino
        // jerarquía, aire y materialidad de superficie.
        //
        // ⚠️ FUENTE DE VERDAD ÚNICA del color. app/globals.css :root DEBE
        // coincidir EXACTAMENTE con estos valores (void/surfaces/borders).
        // ───────────────────────────────────────────────────────────────
        // Superficies — neutro premium (ni #000 ni azulado)
        void: '#0B0B0D', // base / fondo de página
        surface: {
          DEFAULT: '#161618', // surface-1 — cards
          2: '#1E1E21', // surface-2 — elevación
          3: '#27272B', // surface-3 — elevación alta / hover
        },
        // Texto — jerarquía por OPACIDAD sobre `ink`. Suelo de legibilidad:
        // ningún texto informativo por debajo de ink/62 (ver globals.css).
        //   primary ink · secondary ink/66 · tertiary ink/45 (metadata)
        ink: '#F5F5F7',
        // Acento de marca — azul-acero FRÍO, no-mercado. Uso moderado: foco,
        // links, estado activo, wordmark. NUNCA como relleno decorativo.
        accent: '#5B8AF0',
        // ─── Per-agente — NEUTRO (sin hue por agente) ───────────────────
        // Se conservan por compatibilidad (text-a1, bg-a3/15, border-a4/55…).
        // La diferenciación entre agentes es TIPOGRÁFICA (badge A1/A2/A3/A4),
        // no cromática → todos mapean a `ink`.
        a1: '#F5F5F7',
        a2: '#F5F5F7',
        a3: '#F5F5F7',
        a4: '#F5F5F7',
        // ─── Semántica de mercado — SIGNIFICADO INTOCABLE ───────────────
        // SOLO en datos de mercado, niveles, dirección y estado de señal.
        // JAMÁS en chrome, navegación, badges de identidad ni decoración.
        //   emerald → alza · bullish · positivo
        //   rose    → baja · bearish · negativo
        //   amber   → atención · pendiente de confirmación
        emerald: '#34D399',
        rose: '#FB7185',
        amber: '#FBBF24',
        // ─── Slate — secundario / disabled ──────────────────────────────
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
        // Pulso "live" SUTIL — atenuado (antes parpadeo rápido 1↔0.15).
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        // urgPulse: halo SUTIL para señales de mercado URGENTE (dato), no chrome.
        // Atenuado: menor spread/opacidad y más lento. rose nuevo (#FB7185).
        urgPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(251,113,133,0.3)' },
          '50%': { boxShadow: '0 0 0 4px rgba(251,113,133,0)' },
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
        // Pulsos atenuados (antes 1.1s/1.6s/2s — demasiado nerviosos).
        blink: 'blink 2.4s ease-in-out infinite',
        'blink-slow': 'blink 2.8s ease-in-out infinite',
        'urg-pulse': 'urgPulse 2.6s ease-in-out infinite',
        'fade-slide-in': 'fadeSlideIn 380ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
