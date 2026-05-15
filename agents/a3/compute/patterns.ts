/**
 * A.D.A.M. — Patrones chartistas + velas relevantes (compute layer)
 *
 * Refactor Fase 1 · Tarea 1.3
 *
 * Alcance Fase 1 (acordado): doble techo, doble suelo, banderas.
 * Fase 2: triángulos, cuñas, cabeza-hombros, H&S inverso.
 *
 * Diseño: reglas explícitas. Cada función `detectXxx` devuelve `true|false`
 * + un texto descriptivo si aplica. El orquestador (compute.ts) llama a
 * todas y selecciona el patrón con mayor "confianza geométrica" (más
 * touches limpios, mejor proporción).
 *
 * Velas relevantes (separate function) identifica las 3-5 velas más
 * informativas de la serie reciente: gaps grandes, marubozu, hammer, etc.
 * Esto NO es interpretación — solo nombra la vela. La interpretación la
 * añade el LLM en narrate().
 */

import type { OHLCVCandle_t } from '@/agents/shared/types';
import { findSwingPoints, type SwingPoint } from './trend';

// ───────────────────────────────────────────────────────────────────────────
// Patrones — entry points
// ───────────────────────────────────────────────────────────────────────────

export interface PatternResult {
  /** Nombre canónico del patrón detectado, o null si nada claro. */
  patron_detectado: string | null;
}

export function detectPattern(candles: OHLCVCandle_t[]): PatternResult {
  if (candles.length < 30) return { patron_detectado: null };

  // Probar cada patrón en orden de "claridad": el primero que matchea gana.
  // (En producción podríamos scorear por confianza y elegir el mejor; para
  //  Fase 1, orden secuencial es suficiente.)
  if (detectDoubleTop(candles)) return { patron_detectado: 'doble techo' };
  if (detectDoubleBottom(candles)) return { patron_detectado: 'doble suelo' };
  if (detectBullFlag(candles)) return { patron_detectado: 'bandera alcista' };
  if (detectBearFlag(candles)) return { patron_detectado: 'bandera bajista' };

  return { patron_detectado: null };
}

// ───────────────────────────────────────────────────────────────────────────
// Doble techo / doble suelo
//
// Doble techo: dos pivots HIGH cercanos en precio (±1%) separados por al
// menos 5 velas, con un pivot LOW intermedio que crea el "valle" entre
// ambos techos. Tendencia previa: alcista. Confirma al romper el valle.
//
// La detección aquí NO requiere ruptura — basta con la geometría. Es
// "patrón en formación / confirmado por proximidad". El LLM lo narrará.
// ───────────────────────────────────────────────────────────────────────────

function detectDoubleTop(candles: OHLCVCandle_t[]): boolean {
  const pivots = findSwingPoints(candles, 3);
  const highs = pivots.filter((p) => p.type === 'high');
  if (highs.length < 2) return false;

  // Tomar los 2 últimos highs significativos
  const lastTwo = highs.slice(-2);
  const [first, second] = lastTwo as [SwingPoint, SwingPoint];

  // Separación mínima 5 velas
  if (second.index - first.index < 5) return false;

  // Precio similar (±1%)
  const avgPrice = (first.price + second.price) / 2;
  const diff = Math.abs(first.price - second.price) / avgPrice;
  if (diff > 0.01) return false;

  // Debe existir un valle (low) entre los dos highs
  const lows = pivots.filter(
    (p) => p.type === 'low' && p.index > first.index && p.index < second.index
  );
  if (lows.length === 0) return false;

  // El valle debe ser al menos 2% por debajo de los techos
  const valley = Math.min(...lows.map((l) => l.price));
  if ((avgPrice - valley) / avgPrice < 0.02) return false;

  return true;
}

function detectDoubleBottom(candles: OHLCVCandle_t[]): boolean {
  const pivots = findSwingPoints(candles, 3);
  const lows = pivots.filter((p) => p.type === 'low');
  if (lows.length < 2) return false;

  const lastTwo = lows.slice(-2);
  const [first, second] = lastTwo as [SwingPoint, SwingPoint];
  if (second.index - first.index < 5) return false;

  const avgPrice = (first.price + second.price) / 2;
  const diff = Math.abs(first.price - second.price) / avgPrice;
  if (diff > 0.01) return false;

  const peaks = pivots.filter(
    (p) => p.type === 'high' && p.index > first.index && p.index < second.index
  );
  if (peaks.length === 0) return false;
  const peak = Math.max(...peaks.map((p) => p.price));
  if ((peak - avgPrice) / avgPrice < 0.02) return false;

  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Bandera alcista / bajista
//
// Bull flag: movimiento alcista impulsivo + consolidación corta lateral o
// con pendiente ligera bajista. Detectamos:
//   - "Flagpole": cambio >5% en ventana de 3-7 velas hacia arriba
//   - "Flag": las siguientes 5-10 velas se mueven en rango estrecho (<3%)
//
// Bear flag: simétrico.
// ───────────────────────────────────────────────────────────────────────────

function detectBullFlag(candles: OHLCVCandle_t[]): boolean {
  return detectFlag(candles, 'bull');
}

function detectBearFlag(candles: OHLCVCandle_t[]): boolean {
  return detectFlag(candles, 'bear');
}

function detectFlag(candles: OHLCVCandle_t[], direction: 'bull' | 'bear'): boolean {
  if (candles.length < 15) return false;
  const recent = candles.slice(-15);

  // Flagpole = primeras 5 velas
  const pole = recent.slice(0, 5);
  // Flag = siguientes 10
  const flag = recent.slice(5);

  const poleStart = pole[0]!.c;
  const poleEnd = pole[pole.length - 1]!.c;
  const poleChange = (poleEnd - poleStart) / poleStart;

  if (direction === 'bull' && poleChange < 0.05) return false;
  if (direction === 'bear' && poleChange > -0.05) return false;

  // Flag range — diferencia max-min en la consolidación
  const flagHighs = flag.map((c) => c.h);
  const flagLows = flag.map((c) => c.l);
  const flagRange = (Math.max(...flagHighs) - Math.min(...flagLows)) / poleEnd;
  if (flagRange > 0.03) return false;

  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Velas relevantes — nombrado canónico
//
// Identificamos hasta 5 velas notables en la serie reciente (últimas 20).
// Tipos detectados (rule-based, sin LLM):
//   - "gap alcista" / "gap bajista"
//   - "marubozu alcista" / "marubozu bajista" (cuerpo > 80% del rango)
//   - "hammer" / "shooting star" (mecha larga + cuerpo pequeño)
//   - "doji" (cuerpo casi nulo)
//   - "envolvente alcista" / "envolvente bajista" (engulfing)
//
// Devuelve strings tipo "vela 3 sesiones atrás: marubozu alcista" para que
// el narrador del LLM pueda incorporar el contexto sin inventar.
// ───────────────────────────────────────────────────────────────────────────

export function detectRelevantCandles(candles: OHLCVCandle_t[]): string[] {
  if (candles.length < 2) return [];
  const out: string[] = [];
  const lookback = Math.min(20, candles.length - 1);
  const start = candles.length - lookback;

  for (let i = start; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1] ?? c;
    const body = Math.abs(c.c - c.o);
    const range = c.h - c.l;
    if (range === 0) continue;
    const bodyRatio = body / range;
    const upperWick = c.h - Math.max(c.o, c.c);
    const lowerWick = Math.min(c.o, c.c) - c.l;
    const offset = candles.length - 1 - i;
    const label = offset === 0 ? 'vela actual' : `vela ${offset} sesiones atrás`;

    // Gap
    if (i > 0) {
      const gapUp = c.l > prev.h;
      const gapDown = c.h < prev.l;
      if (gapUp) {
        out.push(`${label}: gap alcista`);
        continue;
      }
      if (gapDown) {
        out.push(`${label}: gap bajista`);
        continue;
      }
    }

    // Doji — cuerpo casi inexistente
    if (bodyRatio < 0.1 && range > 0) {
      out.push(`${label}: doji`);
      continue;
    }

    // Marubozu — cuerpo dominante
    if (bodyRatio > 0.8) {
      const dir = c.c > c.o ? 'alcista' : 'bajista';
      out.push(`${label}: marubozu ${dir}`);
      continue;
    }

    // Hammer / Shooting star — mecha larga en un solo lado
    if (lowerWick > body * 2 && upperWick < body) {
      out.push(`${label}: hammer (mecha inferior larga)`);
      continue;
    }
    if (upperWick > body * 2 && lowerWick < body) {
      out.push(`${label}: shooting star (mecha superior larga)`);
      continue;
    }

    // Envolvente
    if (i > 0) {
      const prevBody = Math.abs(prev.c - prev.o);
      const isEngulfing = body > prevBody && Math.sign(c.c - c.o) !== Math.sign(prev.c - prev.o);
      if (isEngulfing) {
        const dir = c.c > c.o ? 'alcista' : 'bajista';
        out.push(`${label}: envolvente ${dir}`);
      }
    }
  }

  // Cap a 5 (más relevantes = más recientes)
  return out.slice(-5);
}

// ───────────────────────────────────────────────────────────────────────────
// Divergencia precio/volumen — para volumen.estado
//
// Divergencia alcista: precio hace LLs pero volumen DECRECIENTE.
// Divergencia bajista: precio hace HHs pero volumen DECRECIENTE.
//
// Necesita ventana mínima 20 velas. Si no aplica, devuelve null y el
// caller usa la clasificación cuantitativa de indicators.ts.
// ───────────────────────────────────────────────────────────────────────────

export function detectVolumeDivergence(
  candles: OHLCVCandle_t[]
): 'divergencia_alcista' | 'divergencia_bajista' | null {
  if (candles.length < 20) return null;
  const win = candles.slice(-20);
  const firstHalf = win.slice(0, 10);
  const secondHalf = win.slice(10);

  const priceFirstAvg = firstHalf.reduce((s, c) => s + c.c, 0) / firstHalf.length;
  const priceSecondAvg = secondHalf.reduce((s, c) => s + c.c, 0) / secondHalf.length;
  const volFirstAvg = firstHalf.reduce((s, c) => s + c.v, 0) / firstHalf.length;
  const volSecondAvg = secondHalf.reduce((s, c) => s + c.v, 0) / secondHalf.length;

  if (volFirstAvg === 0) return null;
  const priceChange = (priceSecondAvg - priceFirstAvg) / priceFirstAvg;
  const volChange = (volSecondAvg - volFirstAvg) / volFirstAvg;

  // Precio sube > 2% pero volumen baja > 20% → divergencia bajista
  if (priceChange > 0.02 && volChange < -0.2) return 'divergencia_bajista';
  // Precio baja > 2% pero volumen baja > 20% → divergencia alcista
  if (priceChange < -0.02 && volChange < -0.2) return 'divergencia_alcista';
  return null;
}
