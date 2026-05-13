import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Enable streaming responses for Vercel AI SDK with edge timeouts where applicable
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS — 6 meses, preload-ready. Solo efectivo si sirves por HTTPS (Vercel sí).
          { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

// Sentry wrapper: si SENTRY_AUTH_TOKEN no está, withSentryConfig se vuelve no-op
// (no sube source maps, no fija release). Permite buildear sin tener cuenta Sentry.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: false,
  hideSourceMaps: true,
});
