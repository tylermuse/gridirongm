import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config — Phase 1 integration tests for the BS Football engine.
 *
 * Design notes:
 * - happy-dom environment gives us `window`, `document`, `localStorage`,
 *   `crypto.randomUUID` without the full jsdom overhead.
 * - The `@/` alias mirrors the Next.js tsconfig path mapping so engine
 *   imports work identically in tests and the app.
 * - Single-thread pool (`forks` would also work) keeps the IndexedDB
 *   polyfill state isolated per test file.
 * - `testTimeout: 30000` is generous — full-season sim tests need it.
 *   Per-assertion failure feedback still surfaces fast.
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true, // describe/it/expect available without import (matches Jest style)
    setupFiles: ['./tests/integration/_setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'dist', '_fresh_clone'],
    testTimeout: 30000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
