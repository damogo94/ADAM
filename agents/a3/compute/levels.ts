/**
 * A.D.A.M. — Soportes y Resistencias (compute layer)
 *
 * Refactor Fase 1 · Tarea 1.3
 *
 * Detecta niveles relevantes mediante CLUSTERING de pivots cercanos. Un
 * "soporte" es una zona donde el precio rebotó múltiples veces; una
 * "resistencia" donde se rechazó múltiples veces.
 *
 * Algoritmo:
 *   1. Obtener todos los swing points de `trend.ts`.
 *   2. Separar highs (resistencias candidatas) y lows (soportes candidatos).
 *   3. Clustering: agrupar pivots cuya distancia < tolerancia (% del precio).
 *   4. Filtrar clusters con ≥ minTouches (default 2).
 *   5. Ordenar por número de touches descendente, devolver top N niveles.
 *   6. Para cada cluster, el "nivel" reportado es el promedio de los pivots
 *      del cluster.
 *
 * Decisión de tolerancia: ±0.5% del precio actual. En equities líquidos
 * captura touches genuinos; en cripto volátil podría querer ±1%. Si hace
 * falta, parametrizable.
 *
 * Resultados se devuelven SOLO niveles relevantes a la zona del precio
 * actual (±20%). Niveles muy lejanos no aportan información operativa.
 */

import type { OHLCVCandle_t } from '@/agents/shared/types';
import { findSwingPoints, type SwingPoint } from './trend';

export interface LevelClusteringOptions {
  /** Tolerancia % para agrupar pivots — 0.5 = ±0.5%. */
  tolerancePct: number;
  /** Mínimo de pivots en un cluster para considerarlo nivel válido. */
  minTouches: number;
  /** Ventana ± para detección de pivots (passthrough a findSwingPoints). */
  pivotWindow: number;
  /** Máximo niveles a devolver de cada lado (soportes / resistencias). */
  maxLevels: number;
  /** Distancia máxima al precio actual en % para considerarlo relevante. */
  maxDistancePct: number;
}

const DEFAULTS: LevelClusteringOptions = {
  tolerancePct: 0.5,
  minTouches: 2,
  pivotWindow: 3,
  maxLevels: 5,
  maxDistancePct: 20,
};

export interface LevelsResult {
  soportes: number[];
  resistencias: number[];
}

export function detectLevels(
  candles: OHLCVCandle_t[],
  opts: Partial<LevelClusteringOptions> = {}
): LevelsResult {
  const o = { ...DEFAULTS, ...opts };
  if (candles.length < o.pivotWindow * 2 + 1) {
    return { soportes: [], resistencias: [] };
  }

  const currentPrice = candles[candles.length - 1]!.c;
  const pivots = findSwingPoints(candles, o.pivotWindow);
  const highs = pivots.filter((p) => p.type === 'high');
  const lows = pivots.filter((p) => p.type === 'low');

  const resistencias = clusterAndFilter(highs, currentPrice, o);
  const soportes = clusterAndFilter(lows, currentPrice, o);

  // Resistencias: solo niveles ARRIBA del precio actual
  // Soportes: solo niveles ABAJO del precio actual
  return {
    resistencias: resistencias.filter((p) => p > currentPrice).slice(0, o.maxLevels),
    soportes: soportes.filter((p) => p < currentPrice).slice(0, o.maxLevels),
  };
}

/**
 * Agrupa pivots cercanos y devuelve el nivel promedio de cada cluster que
 * cumpla minTouches. Ordenado por # touches (más relevantes primero).
 */
function clusterAndFilter(
  pivots: SwingPoint[],
  currentPrice: number,
  opts: LevelClusteringOptions
): number[] {
  if (pivots.length === 0) return [];

  // Ordenar por precio para que el clustering por proximidad sea correcto
  const sorted = [...pivots].sort((a, b) => a.price - b.price);

  const clusters: SwingPoint[][] = [];
  let currentCluster: SwingPoint[] = [sorted[0]!];
  const tolerance = currentPrice * (opts.tolerancePct / 100);

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i]!;
    const lastInCluster = currentCluster[currentCluster.length - 1]!;
    if (Math.abs(p.price - lastInCluster.price) <= tolerance) {
      currentCluster.push(p);
    } else {
      clusters.push(currentCluster);
      currentCluster = [p];
    }
  }
  clusters.push(currentCluster);

  // Filtrar por minTouches y por distancia al precio actual
  const maxDist = currentPrice * (opts.maxDistancePct / 100);
  const validClusters = clusters.filter((c) => {
    if (c.length < opts.minTouches) return false;
    const avg = c.reduce((s, p) => s + p.price, 0) / c.length;
    return Math.abs(avg - currentPrice) <= maxDist;
  });

  // Ordenar: más touches primero, luego más cercano al precio actual
  validClusters.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const avgA = a.reduce((s, p) => s + p.price, 0) / a.length;
    const avgB = b.reduce((s, p) => s + p.price, 0) / b.length;
    return Math.abs(avgA - currentPrice) - Math.abs(avgB - currentPrice);
  });

  // Devolver el nivel promedio de cada cluster, redondeado razonablemente
  return validClusters.map((c) => {
    const avg = c.reduce((s, p) => s + p.price, 0) / c.length;
    return round2(avg);
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
