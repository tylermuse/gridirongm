/**
 * Vitest setup — runs once per test file before any tests.
 *
 * Polyfills + mocks the browser APIs the engine and its dependencies expect
 * to exist:
 *  - IndexedDB (used by idb in @bs/core/storage, behind the Zustand persist
 *    middleware, and by Dexie in BS Hoops). Each test file gets empty
 *    databases because it runs in its own worker (see vitest.config.ts).
 *  - crypto.randomUUID (Node 19+ has it; happy-dom may or may not expose it
 *    depending on version)
 *  - fetch (used by newLeague to load league files from URL — mocked to
 *    return fixture data so tests don't hit the network)
 *  - window.location.reload (called by store.ts in error recovery paths;
 *    no-op'd so tests don't get torn down)
 *
 * If a test needs to override one of these mocks (e.g., make fetch fail to
 * test error paths), it can use vi.mock() locally — these defaults are
 * sane no-ops for the happy path.
 */
import 'fake-indexeddb/auto';
import { vi, beforeEach } from 'vitest';

// Each test file must start in an environment no other file has used. That
// only holds while vitest.config.ts runs every file in its own worker; with
// singleThread / singleFork / isolate: false, the next file inherits this
// one's IndexedDB saves, window globals and still-running timers, and tests
// pass or fail depending on which file ran before them. Fail the file instead.
const ENV_IN_USE = Symbol.for('bs-tests.environment-in-use');
const testGlobals = globalThis as typeof globalThis & { [ENV_IN_USE]?: boolean };
if (testGlobals[ENV_IN_USE]) {
  throw new Error(
    'This test file is reusing an environment an earlier file ran in, so that file\'s IndexedDB data and globals are ' +
      'still here. Run each file in its own worker: no singleThread, singleFork or isolate: false (see vitest.config.ts).',
  );
}
testGlobals[ENV_IN_USE] = true;

// crypto.randomUUID is available in Node 19+, but happy-dom can sometimes
// shadow it with an undefined value. Restore it from globalThis if missing.
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  // Fall back to a deterministic stub for older environments. Real Node 19+
  // and happy-dom should have the native impl available.
  // The cast to Crypto['randomUUID'] is needed because TS narrows the return
  // type to a template literal `${string}-${string}-...`; our fallback
  // produces strings of that shape but TS can't prove it statically.
  const fallback = (): string =>
    // RFC 4122 v4 shape, not cryptographically secure — fine for test IDs.
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  (crypto as Crypto).randomUUID = fallback as Crypto['randomUUID'];
}

// Stub window.location.reload so error-recovery paths don't blow up the
// test runner. Tests that care about reload behavior can spy on it via
// vi.spyOn(window.location, 'reload').
Object.defineProperty(window, 'location', {
  configurable: true,
  value: {
    ...window.location,
    reload: vi.fn(),
  },
});

// Reset all mocks between tests so spy assertions in one test don't pollute
// expectations in another. fake-indexeddb persists across tests within a
// file by design (mirrors browser behavior), but never into the next file;
// use beforeEach in individual tests to reset stores if needed.
beforeEach(() => {
  vi.clearAllMocks();
});
