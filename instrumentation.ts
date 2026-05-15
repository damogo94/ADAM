// Next.js 14 instrumentation hook — Sentry init server/edge inline.
// El SDK warneaba si esto vivía en archivos separados. Si NEXT_RUNTIME no es
// uno de los runtimes, no hacemos nada. Si SENTRY_DSN está vacío, Sentry no-ops.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  const runtime = process.env.NEXT_RUNTIME;

  if (runtime === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: !!process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      sendDefaultPii: false,
      beforeSend(event, hint) {
        const error = hint.originalException;
        const msg = error instanceof Error ? error.message : '';
        // Filtra ruido conocido — son fallos transitorios manejados con retry/fallback.
        // Sin esto, un blip de Anthropic con 5 users quema 200+ eventos en minutos.
        if (msg.includes('rate-limited') || msg.includes('rate_limit_exceeded')) return null;
        if (msg.includes('Overloaded') || msg.includes('overloaded_error')) return null;
        if (msg.includes('APIConnectionError') || msg.includes('APIConnectionTimeoutError')) return null;
        return event;
      },
    });
  }

  if (runtime === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: !!process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      sendDefaultPii: false,
    });
  }
}

// captureRequestError es el hook de Next 14 para reportar errores
// de RSC/Route Handlers a Sentry automáticamente.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
