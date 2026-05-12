import type { ReactNode } from 'react';

/**
 * Layout para rutas de auth (/login, /signup).
 * Reemplaza el layout raíz: sin bottom-nav, fondo de void.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center px-4">
      {children}
    </div>
  );
}
