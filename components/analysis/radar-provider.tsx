'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';
import { RadarResponse, type RadarResponse_t } from '@/lib/radar/types';

/**
 * RadarProvider — el RADAR (scan persistido) como dato AMBIENTAL del shell
 * (workspace): se carga UNA vez por sesión y lo comparten /watchlist (su vista
 * principal) y /analysis (el puente "tu radar" post-resolve). B1·F2: mata el
 * doble fetch (antes /analysis re-pedía /api/watchlist/radar por su cuenta).
 *
 * DISJUNTO de RunProvider POR DISEÑO: el radar NUNCA lee el estado del run y
 * viceversa (claridad + no arrastra el aislamiento A3/EST). Expone setRadar/
 * setError para las mutaciones optimistas de /watchlist y reload() para refrescar
 * tras un CRUD.
 */
interface RadarContextValue {
  radar: RadarResponse_t | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setRadar: Dispatch<SetStateAction<RadarResponse_t | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

const RadarContext = createContext<RadarContextValue | null>(null);

export function useRadar(): RadarContextValue {
  const ctx = useContext(RadarContext);
  if (!ctx) throw new Error('useRadar debe usarse dentro de <RadarProvider>');
  return ctx;
}

export function RadarProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [radar, setRadar] = useState<RadarResponse_t | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/watchlist/radar');
      if (!r.ok) {
        if (r.status === 401) {
          router.push('/login');
          return;
        }
        const j = await r.json().catch(() => ({}));
        // `detail` puede venir como array de issues Zod; solo lo usamos si es string.
        const msg =
          typeof j?.detail === 'string'
            ? j.detail
            : typeof j?.error === 'string'
              ? j.error
              : 'fetch_failed';
        throw new Error(msg);
      }
      const data = await r.json();
      const parsed = RadarResponse.safeParse(data);
      if (!parsed.success) {
        // eslint-disable-next-line no-console
        console.warn('[radar] respuesta invalida', parsed.error.issues.slice(0, 3));
        throw new Error('respuesta de radar inválida');
      }
      setRadar(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }

  // Carga AMBIENTAL: una vez al montar el shell (workspace). Persiste entre rutas
  // (el layout no se remonta en soft-nav) → una sola llamada a /radar por sesión.
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: RadarContextValue = { radar, loading, error, reload, setRadar, setError };
  return <RadarContext.Provider value={value}>{children}</RadarContext.Provider>;
}
