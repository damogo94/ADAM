/**
 * A.D.A.M. — Estructura · confluencia institucional ("Eje Y", manual §3)
 *
 * "El Setup Perfecto: un nivel estructural ('rompe y apoya') que coincide
 * milimétricamente con un precio psicológico redondo que, a su vez, concentra
 * una barrera de liquidez en opciones vanilla."
 *
 * Tres pilares → score 0-100:
 *   - nivel estructural (zona de retesteo presente) ........ +40
 *   - número redondo coincide con la zona ................... +30
 *   - muro de opciones vanilla coincide .................... +30
 *
 * Fase 1: no hay datos de opciones → el pilar vanilla aporta 0 (techo 70) y
 * `vanilla_disponible=false`. Los redondos hacen de proxy: `setup_perfecto`
 * se alcanza con estructura+redondo. Cuando se enchufe un proveedor (Fase 3),
 * el muro pasa a exigirse y el techo sube a 100 sin cambiar el contrato.
 */

import type { AssetProfile } from '@/agents/a3/profiles';
import { nearestRound } from './redondos';
import { nearestVanillaWall, type VanillaWall } from '../vanilla';
import type { Confluencia_t, RangoOperativo_t } from '../schema';

const PESO_ESTRUCTURA = 40;
const PESO_REDONDO = 30;
const PESO_VANILLA = 30;

export function computeConfluencia(
  rango: RangoOperativo_t,
  profile: AssetProfile,
  vanillaWalls: VanillaWall[] | null | undefined
): Confluencia_t {
  const zona = rango.zona_retesteo;
  const vanillaDisponible = Boolean(vanillaWalls && vanillaWalls.length > 0);
  const tol = profile.level_tolerance_pct;

  // Sin zona estructural no hay confluencia que evaluar.
  if (!zona) {
    return {
      precio_redondo: null,
      distancia_redondo_pct: null,
      barrera_vanilla: null,
      vanilla_disponible: vanillaDisponible,
      setup_perfecto: false,
      score: 0,
      descripcion: 'Sin zona estructural de retesteo — no hay confluencia que evaluar.',
    };
  }

  const round = nearestRound(zona.nivel, profile);
  const redondoCoincide = round != null && round.distancia_pct <= tol;

  const muro = nearestVanillaWall(zona.nivel, vanillaWalls, tol);
  const muroCoincide = muro != null;

  let score = PESO_ESTRUCTURA;
  if (redondoCoincide) score += PESO_REDONDO;
  if (muroCoincide) score += PESO_VANILLA;

  // Setup perfecto: estructura + redondo y, SI hay datos de opciones, también
  // el muro. En Fase 1 (sin datos) el redondo basta como proxy del 3.er pilar.
  const setup_perfecto =
    redondoCoincide && (vanillaDisponible ? muroCoincide : true);

  const descripcion = buildDescripcion({
    redondoCoincide,
    redondo: round?.nivel ?? null,
    vanillaDisponible,
    muroCoincide,
    muro: muro?.strike ?? null,
  });

  return {
    precio_redondo: round?.nivel ?? null,
    distancia_redondo_pct: round != null ? Number(round.distancia_pct.toFixed(3)) : null,
    barrera_vanilla: muro?.strike ?? null,
    vanilla_disponible: vanillaDisponible,
    setup_perfecto,
    score: Math.min(100, score),
    descripcion,
  };
}

function buildDescripcion(p: {
  redondoCoincide: boolean;
  redondo: number | null;
  vanillaDisponible: boolean;
  muroCoincide: boolean;
  muro: number | null;
}): string {
  const partes: string[] = [];
  partes.push(
    p.redondoCoincide && p.redondo != null
      ? `coincide con el redondo ${p.redondo}`
      : 'sin redondo psicológico próximo'
  );
  if (!p.vanillaDisponible) {
    partes.push('muro vanilla no disponible (sin datos de opciones)');
  } else if (p.muroCoincide && p.muro != null) {
    partes.push(`reforzado por muro vanilla en ${p.muro}`);
  } else {
    partes.push('sin muro vanilla próximo');
  }
  return `Zona estructural ${partes.join('; ')}.`.slice(0, 300);
}
