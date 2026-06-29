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
        // Body + wordmark (el logotipo "A.D.A.M." usa Inter extrabold + tracking
        // ancho desde la retirada de Orbitron — coherente con "Instrumento de
        // precisión", sin familia de fuente decorativa extra).
        // Self-host vía next/font (app/layout.tsx) → variables CSS, con fallback.
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        // Technical data / números / tickers
        mono: ['var(--font-mono)', '"IBM Plex Mono"', '"JetBrains Mono"', 'monospace'],
      },
      // ─── Escala tipográfica fluida — 8 roles deliberados (clamp) ──────────
      // SSOT de tamaño de tipo del landing /inicio. El tracking se aplica con
      // utilidades `tracking-*` por uso (no se hornea aquí, para no chocar con
      // ellas). Mapea 1:1 a --fs-* del prototipo (design/adam-inicio.html).
      fontSize: {
        'fluid-micro': ['0.6875rem', { lineHeight: '1.45' }], // 11px · micro-eyebrow/sublínea mono
        'fluid-caption': ['0.75rem', { lineHeight: '1.4' }], // 12px · micro-readout mono
        'fluid-label': ['0.8125rem', { lineHeight: '1.4' }], // 13px · eyebrow/label mono
        'fluid-body': ['1rem', { lineHeight: '1.6' }],
        'fluid-lead': ['clamp(1.0625rem, 0.99rem + 0.38vw, 1.25rem)', { lineHeight: '1.55' }],
        'fluid-h3': ['clamp(1.125rem, 1.06rem + 0.34vw, 1.375rem)', { lineHeight: '1.3' }],
        'fluid-h2': ['clamp(1.5rem, 1.24rem + 1.1vw, 2.25rem)', { lineHeight: '1.1' }],
        'fluid-h1': ['clamp(2.25rem, 1.62rem + 2.7vw, 3.75rem)', { lineHeight: '1.05' }],
        'fluid-display': ['clamp(2.6rem, 1.7rem + 4vw, 4.75rem)', { lineHeight: '1.02' }],
      },
      // Radios de card del sistema. card = r-xl (22px, hero/verdict/inicio).
      // card-sm/md tokenizan los [15px]/[18px] ubicuos (antes arbitrarios). El
      // resto (inputs/chips puntuales) mapea a Tailwind o queda arbitrario.
      borderRadius: {
        card: '22px',
        'card-sm': '15px',
        'card-md': '18px',
      },
      // Curva maestra del sistema (mismo cubic-bezier de todo el motion). Se usa
      // como `ease-precise`, evitando un valor arbitrario ambiguo para Tailwind.
      transitionTimingFunction: {
        precise: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      // Sombras en capas coherentes (sh-1/2/3 del prototipo) → shadow-e1/e2/e3.
      boxShadow: {
        e1: '0 1px 2px rgba(0,0,0,.4)',
        e2: '0 8px 24px -8px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)',
        e3: '0 24px 60px -16px rgba(0,0,0,.7), 0 8px 20px -8px rgba(0,0,0,.5)',
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
        // dashFlow: "marching ants" lentos en accent para las flechas del
        // pipeline (ReasonFlow). Solo corre mientras la sección está en viewport
        // (se gatea con una clase desde el componente) → ahorra INP.
        dashFlow: {
          to: { strokeDashoffset: '-16' },
        },
        // ─── Hero "pipeline neuronal" (ConfluenceHero) ──────────────────────
        // synPop: una sinapsis "dispara" al energizarse su región (con stagger
        // por distancia al centro, vía animationDelay inline).
        synPop: {
          '0%': { opacity: '0.1', transform: 'scale(0.4)' },
          '60%': { opacity: '1', transform: 'scale(1.18)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // synTwinkle: titileo sutil de la sinapsis ya encendida en `resolved`
        // (el núcleo "sigue pensando", sin afirmar progreso).
        synTwinkle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        // webFire: pulso de "corriente" por una dendrita cuando ambos extremos
        // ya están encendidos (cascada neuronal). stroke usa var(--accent) — es
        // propiedad CSS (no atributo SVG), por eso aquí sí resuelve.
        webFire: {
          '0%': { stroke: 'var(--accent)', opacity: '0.75', strokeWidth: '1.4' },
          '100%': { opacity: '0.13', strokeWidth: '0.8' },
        },
        // coreBreath: el núcleo "respira" mientras calibra; se detiene al resolver.
        coreBreath: {
          '0%, 100%': { transform: 'scale(0.985)' },
          '50%': { transform: 'scale(1.015)' },
        },
      },
      animation: {
        sweep: 'sweep 2.2s ease-in-out infinite',
        // Pulsos atenuados (antes 1.1s/1.6s/2s — demasiado nerviosos).
        blink: 'blink 2.4s ease-in-out infinite',
        'blink-slow': 'blink 2.8s ease-in-out infinite',
        'urg-pulse': 'urgPulse 2.6s ease-in-out infinite',
        'fade-slide-in': 'fadeSlideIn 380ms ease-out',
        'dash-flow': 'dashFlow 1.1s linear infinite',
        // Hero pipeline neuronal
        'syn-pop': 'synPop 0.42s cubic-bezier(0.22,1.2,0.36,1) both',
        'syn-twinkle': 'synTwinkle 3.4s ease-in-out 1s infinite',
        'web-fire': 'webFire 0.8s ease-out',
        'core-breath': 'coreBreath 3.4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
