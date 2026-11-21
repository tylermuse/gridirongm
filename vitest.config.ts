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
 * - Each test file runs in its own worker thread (`pool: 'threads'` with
 *   vitest's default `isolate: true`). That is what keeps files apart: each
 *   gets its own globals, happy-dom window and localStorage, its own
 *   fake-indexeddb databases (tests/integration/_setup.ts) and module
 *   instances, and any timer a file leaves running ends with its worker.
 *   Within one file, IndexedDB and module state carry across tests, the way
 *   they would in one page load. Files run in parallel (CPU cores minus one
 *   workers under `vitest run`, half the cores in watch mode);
 *   `--no-file-parallelism` runs them one at a time, each still in a fresh
 *   worker.
 * - Don't set `poolOptions.threads.singleThread`, `poolOptions.forks.singleFork`
 *   or `isolate: false`. These run many files in one worker under one
 *   environment, so the IndexedDB polyfill, window globals and leftover
 *   timers carry from one file into the next (a league saved by one file
 *   turned up in another's save slot). _setup.ts fails every file after the
 *   first if that happens.
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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
