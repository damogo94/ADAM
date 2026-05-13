'use client';

import * as Sentry from '@sentry/nextjs';
import Error from 'next/error';
import { useEffect } from 'react';

/**
 * App Router global error boundary — captura errores de render React que
 * burbujean fuera de los error.tsx por segmento. Manda a Sentry y muestra
 * la pantalla de error estándar de Next.
 *
 * Si SENTRY_DSN no está, Sentry.captureException es no-op.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        {/* Next.js error component genérico */}
        <Error statusCode={500} />
      </body>
    </html>
  );
}
