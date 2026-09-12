import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Config DEDICADA a harnesses/scripts de análisis offline (calibración, etc.).
 * NO son tests de CI: el `pnpm test` usa vitest.config.ts (que solo incluye
 * ficheros .test.ts) y este harness (scripts/, sin `.test`) jamás entra ahí.
 *
 * Correr un harness:  corepack pnpm exec vitest run --config vitest.harness.config.ts
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.ts'],
    // scripts/lib = helpers puros de los harnesses (gates/stats, ADR-0006) y sus
    // tests unitarios: no son harnesses (vitest fallaría con "no test suite") y
    // sus __tests__ ya corren en el `pnpm test` normal (vitest.config.ts).
    exclude: ['node_modules', '.next', 'scripts/lib/**'],
    testTimeout: 120000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/stubs/empty.ts', import.meta.url)),
    },
  },
});
