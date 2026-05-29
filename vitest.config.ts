import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests-e2e', '.claude/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/stubs/empty.ts', import.meta.url)),
    },
  },
});
