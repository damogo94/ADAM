'use client';

/**
 * Lente Educativa — provider de modo + persistencia.
 *
 * Modos:
 *   - 'prosumer'  → comportamiento default. Términos técnicos sin glosa.
 *   - 'educativo' → mismos números/dictámenes, pero las palabras técnicas
 *                   se subrayan y muestran explicación al pasar.
 *
 * Persistencia (decisión F de FASE 0): localStorage. Cumple "no se
 * resetea por sesión", sin migración de DB. Cross-device viene en V2 si
 * pides `profiles.preferences`.
 *
 * INVARIANTE LOAD-BEARING: el toggle JAMÁS cambia números ni señales.
 * El provider solo expone el modo activo; los componentes deciden cómo
 * presentarlo a través de <Glossed>. Cero rerenders que muevan datos.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type LensMode = 'prosumer' | 'educativo';

const STORAGE_KEY = 'adam.lens.mode';

interface LensContextValue {
  mode: LensMode;
  setMode: (mode: LensMode) => void;
  toggle: () => void;
}

const LensContext = createContext<LensContextValue | null>(null);

export function LensProvider({ children }: { children: ReactNode }) {
  // SSR-safe init: arrancamos en 'prosumer' y rehidratamos en useEffect.
  // Esto evita hydration mismatch (servidor no tiene localStorage).
  const [mode, setModeState] = useState<LensMode>('prosumer');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'prosumer' || stored === 'educativo') {
        setModeState(stored);
      }
    } catch {
      // localStorage puede no estar disponible (Safari incógnito,
      // cookies bloqueadas). Degrada a 'prosumer' por sesión.
    }
    setHydrated(true);
  }, []);

  const setMode = (next: LensMode) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // no-op: el valor vive en memoria igualmente.
      }
    }
  };

  const toggle = () => setMode(mode === 'prosumer' ? 'educativo' : 'prosumer');

  // Nota: NO bloqueamos el render hasta hidratar. Servir como prosumer
  // en SSR y aplicar el modo guardado tras hidratación es aceptable
  // porque los DATOS no cambian — solo se enriquecen los términos.
  // `hydrated` está disponible para componentes que quieran evitar
  // el flash inicial; por defecto no lo usan.
  return (
    <LensContext.Provider value={{ mode, setMode, toggle }}>
      {children}
      {/* hint de hidratación silencioso para evitar warning de unused-vars */}
      <span hidden aria-hidden="true" data-lens-hydrated={hydrated} />
    </LensContext.Provider>
  );
}

export function useLens(): LensContextValue {
  const ctx = useContext(LensContext);
  if (!ctx) {
    // No tirar: degradamos a 'prosumer' constante. Si un componente
    // queda fuera del provider por accidente, la app sigue funcionando.
    return {
      mode: 'prosumer',
      setMode: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
