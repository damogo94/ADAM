'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentStatus } from '@/components/agent-card-shell';

const isLanded = (s: AgentStatus): boolean => s === 'done' || s === 'anomaly' || s === 'live';

/**
 * useLandingBeat — nonce que sube UNA vez en cada transición REAL `scanning→landed`
 * (done/anomaly/live). Es la FUENTE ÚNICA del "latido de aterrizaje": lo consumen tanto
 * el `land-flash` de la card (`agent-card-shell`) como el énfasis del affordance de
 * razonamiento (`disclosure`), garantizando UN SOLO beat coordinado (misma curva, misma
 * duración, mismo instante) en vez de dos animaciones que se pisan.
 *
 * Honestidad: NO dispara al montar ya-aterrizado (run persistido — navegar al radar y
 * volver); la celebración va atada a su evento, no a la mera presencia del estado.
 */
export function useLandingBeat(status: AgentStatus): number {
  const landed = isLanded(status);
  const prevLanded = useRef(landed);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (landed && !prevLanded.current) setBeat((b) => b + 1);
    prevLanded.current = landed;
  }, [landed]);
  return beat;
}
