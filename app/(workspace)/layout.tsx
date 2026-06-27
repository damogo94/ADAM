import { RunProvider } from '@/components/analysis/run-provider';
import { RadarProvider } from '@/components/analysis/radar-provider';

/**
 * Layout del route-group (workspace) — NO cambia la URL (/analysis, /watchlist
 * siguen igual) y NO se remonta al soft-navegar entre sus rutas hijas. Eso hace
 * que el estado PERSISTA al ir del análisis al radar y volver: es el shell
 * persistente de B1.
 *
 * Dos providers DISJUNTOS: RunProvider (estado del análisis) + RadarProvider
 * (radar ambiental, compartido por /analysis y /watchlist). Ninguno lee al otro.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RunProvider>
      <RadarProvider>{children}</RadarProvider>
    </RunProvider>
  );
}
