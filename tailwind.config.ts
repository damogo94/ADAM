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
        // A.D.A.M. "Deep Space Terminal" palette — must match adam_demo.html
        void: '#020610',
        surface: {
          DEFAULT: '#07091a',
          2: '#0b0e21',
          3: '#10142a',
        },
        // Per-agent accents
        a1: '#3b82f6', // blue — assets
        a2: '#22d3ee', // cyan — macro
        a3: '#f59e0b', // amber — trading
        a4: '#a78bfa', // violet — system
        // Confidence palette
        emerald: '#10b981',
        rose: '#f43f5e',
        slate: {
          DEFAULT: '#475569',
          l: '#94a3b8',
        },
      },
      fontFamily: {
        // Brand / titles
        orbitron: ['Orbitron', 'monospace'],
        // Body
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Technical data / numbers
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
        urgPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(244,63,94,0.3)' },
          '50%': { boxShadow: '0 0 0 4px rgba(244,63,94,0)' },
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
