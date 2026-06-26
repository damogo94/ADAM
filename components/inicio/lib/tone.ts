/**
 * FIREWALL SEMÁNTICO — única vía del color de mercado en /inicio.
 *
 * emerald/rose/amber SOLO pueden colorear DATOS DE MERCADO (dirección del
 * veredicto, arco del gauge, κ y su marcador, nivel, entrada/stop/objetivo).
 * El chrome (nav, CTAs, tablist, graticule, glow, readouts, decoración) usa
 * ÚNICAMENTE void/surface/ink + accent — y NO pasa por aquí.
 *
 * Todo color semántico se deriva de la dirección del veredicto vía
 * `VERDICT_TONE` (example.ts). Si necesitas color de mercado, sácalo de `TONE`;
 * nunca escribas emerald/rose/amber a mano en un componente.
 *
 * Las clases viven como literales en este módulo (incluido en el content glob de
 * Tailwind) → se generan aunque se elijan en runtime.
 */
import { type Direccion, VERDICT_TONE } from '../example';

export type Tone = 'up' | 'down' | 'warn';

export interface ToneStyle {
  /** Hex para stroke/fill de SVG (gauge). Dato de mercado. */
  hex: string;
  /** text-emerald | text-rose | text-amber */
  text: string;
  /** Borde de chips/realces de dato. */
  border: string;
  /** Fondo del panel de veredicto (derivado, NO hardcodeado). */
  panelBg: string;
  /** Borde superior del panel de veredicto. */
  panelBorder: string;
  /** Relleno tenue de la zona ACTIVA de la regla de κ (solo el dato vivo). */
  zoneFill: string;
  /** Marcador deslizante de la regla de κ. */
  marker: string;
  /** ▲ ▼ ◆ — glifo de dirección (info no solo por color). */
  glyph: string;
  /** Palabra de dirección (info no solo por color). */
  word: string;
}

export const TONE: Record<Tone, ToneStyle> = {
  up: {
    hex: '#34D399',
    text: 'text-emerald',
    border: 'border-emerald/40',
    panelBg: 'bg-emerald/[0.06]',
    panelBorder: 'border-emerald/30',
    zoneFill: 'bg-emerald/20',
    marker: 'bg-emerald',
    glyph: '▲',
    word: 'Positivo',
  },
  down: {
    hex: '#FB7185',
    text: 'text-rose',
    border: 'border-rose/40',
    panelBg: 'bg-rose/[0.06]',
    panelBorder: 'border-rose/30',
    zoneFill: 'bg-rose/20',
    marker: 'bg-rose',
    glyph: '▼',
    word: 'Negativo',
  },
  warn: {
    hex: '#FBBF24',
    text: 'text-amber',
    border: 'border-amber/40',
    panelBg: 'bg-amber/[0.06]',
    panelBorder: 'border-amber/30',
    zoneFill: 'bg-amber/20',
    marker: 'bg-amber',
    glyph: '◆',
    word: 'Neutral',
  },
};

/** Tono de mercado a partir de la dirección del veredicto. */
export function toneFor(d: Direccion): ToneStyle {
  return TONE[VERDICT_TONE[d]];
}

/** Tono de la variación de precio (dato de mercado) según su signo. */
export function changeTone(positive: boolean): ToneStyle {
  return positive ? TONE.up : TONE.down;
}
