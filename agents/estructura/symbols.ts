/**
 * A.D.A.M. — Estructura · resolución de símbolos
 *
 * El usuario opera sobre FUTUROS pero está acostumbrado a la nomenclatura
 * spot/índice (XAUUSD, NAS100). Este resolver traduce esa nomenclatura al
 * símbolo de datos de Yahoo (=F) que sí devuelve OHLCV, conservando la
 * etiqueta que el usuario teclea para mostrarla en la salida.
 *
 *   resolveEstructuraSymbol('XAUUSD') → { display: 'XAUUSD', dataSymbol: 'GC=F' }
 *   resolveEstructuraSymbol('NAS100') → { display: 'NAS100', dataSymbol: 'NQ=F' }
 *   resolveEstructuraSymbol('AAPL')   → { display: 'AAPL',   dataSymbol: 'AAPL' }
 *
 * Para todo lo que no esté en el mapa de futuros, cae al `resolveTicker` del
 * catálogo (GOLD→GC=F, alias, passthrough).
 */

import { resolveTicker } from '@/lib/catalog/assets';

/**
 * Nomenclatura del usuario (futuros) → símbolo Yahoo. Claves en MAYÚSCULAS.
 * Cubre los activos del manual (oro, NAS100) + los futuros índice/materia
 * prima más habituales para un operador de futuros.
 */
const FUTUROS: Record<string, string> = {
  // Oro
  XAUUSD: 'GC=F',
  'XAU/USD': 'GC=F',
  'XAUUSD=X': 'GC=F',
  XAU: 'GC=F',
  // Plata
  XAGUSD: 'SI=F',
  'XAG/USD': 'SI=F',
  XAG: 'SI=F',
  // Nasdaq 100
  NAS100: 'NQ=F',
  US100: 'NQ=F',
  USTEC: 'NQ=F',
  NDX100: 'NQ=F',
  NASDAQ100: 'NQ=F',
  NQ: 'NQ=F',
  // S&P 500
  US500: 'ES=F',
  SPX500: 'ES=F',
  SP500FUT: 'ES=F',
  ES: 'ES=F',
  // Dow Jones
  US30: 'YM=F',
  DJ30: 'YM=F',
  YM: 'YM=F',
  // Petróleo
  USOIL: 'CL=F',
  WTIUSD: 'CL=F',
  CL: 'CL=F',
};

export interface ResolvedSymbol {
  /** Etiqueta que el usuario tecleó (su nomenclatura). Va al output. */
  display: string;
  /** Símbolo Yahoo para fetch de velas y para derivar el profile. */
  dataSymbol: string;
}

export function resolveEstructuraSymbol(input: string): ResolvedSymbol {
  const display = input.trim().toUpperCase();
  if (!display) return { display, dataSymbol: display };
  const futuro = FUTUROS[display];
  if (futuro) return { display, dataSymbol: futuro };
  // Fallback al catálogo (GOLD→GC=F, alias conocidos, o passthrough).
  return { display, dataSymbol: resolveTicker(display) };
}
