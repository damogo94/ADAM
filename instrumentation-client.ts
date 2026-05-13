// Next.js 14 client instrumentation — Sentry browser init.
// Si NEXT_PUBLIC_SENTRY_DSN no está, Sentry.init no-op.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NODE_ENV,
  sendDefaultPii: false,
});

// Track navegaciones App Router para que Sentry los muestre como transacciones.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
