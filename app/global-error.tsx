'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * App Router global error boundary — captura errores de render React que
 * burbujean fuera de los error.tsx por segmento. Manda a Sentry y muestra
 * pantalla de error en español con la estética del producto.
 *
 * Si SENTRY_DSN no está, Sentry.captureException es no-op.
 */
export default function GlobalError({
  error,
}: {
  error: globalThis.Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#020610',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 800,
              fontSize: 28,
              letterSpacing: '0.18em',
              marginBottom: 8,
            }}
          >
            500 · ERROR INTERNO
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Algo se rompió y el sistema lo reportó automáticamente. Reintenta o vuelve a la pantalla de
            análisis.
          </p>
          <a
            href="/analysis"
            style={{
              display: 'inline-block',
              background: '#3b82f6',
              color: '#fff',
              padding: '10px 24px',
              borderRadius: 8,
              textDecoration: 'none',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.1em',
            }}
          >
            VOLVER ▶
          </a>
        </div>
      </body>
    </html>
  );
}
