import { RunProvider } from '@/components/analysis/run-provider';

/**
 * Layout del route-group (workspace) — NO cambia la URL (/analysis, /watchlist
 * siguen igual) y NO se remonta al soft-navegar entre sus rutas hijas. Eso hace
 * que el estado del análisis (RunProvider) PERSISTA al ir al radar y volver: es
 * el shell persistente de B1. Server component que solo monta el provider cliente.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <RunProvider>{children}</RunProvider>;
}
