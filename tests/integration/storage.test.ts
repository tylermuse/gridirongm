/**
 * @bs/core/storage smoke test.
 *
 * Validates that the IndexedDB CRUD layer works end-to-end against
 * fake-indexeddb (the test polyfill). If this passes, the storage
 * extraction from src/lib/storage.ts to @bs/core/storage didn't break
 * the basic save/load contract.
 *
 * Does NOT exercise:
 *   - Real-browser IndexedDB quirks (Safari quota limits, private mode)
 *   - The migrateFromLocalStorage() path (would need to seed window.localStorage)
 *   - Concurrent writes (fake-indexeddb serializes them anyway)
 *
 * Those are best caught with a manual browser smoke test before Phase 1 ships.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getItem,
  setItem,
  removeItem,
  idbStorage,
} from '@bs/core/storage';

describe('@bs/core/storage', () => {
  beforeEach(async () => {
    // Clean slate between tests so fixture leakage doesn't shadow assertions.
    // The keys we touch in this file:
    await removeItem('test-key');
    await removeItem('zustand-test');
  });

  it('round-trips a value via setItem / getItem', async () => {
    await setItem('test-key', 'hello world');
    const got = await getItem('test-key');
    expect(got).toBe('hello world');
  });

  it('returns null for a missing key', async () => {
    const got = await getItem('this-key-does-not-exist');
    expect(got).toBeNull();
  });

  it('removeItem deletes a value', async () => {
    await setItem('test-key', 'to-be-deleted');
    await removeItem('test-key');
    const got = await getItem('test-key');
    expect(got).toBeNull();
  });

  it('idbStorage adapter has the Zustand-persist-compatible shape', async () => {
    // Zustand's persist middleware expects { getItem, setItem, removeItem }.
    expect(typeof idbStorage.getItem).toBe('function');
    expect(typeof idbStorage.setItem).toBe('function');
    expect(typeof idbStorage.removeItem).toBe('function');

    // Functional round-trip via the adapter
    await idbStorage.setItem('zustand-test', JSON.stringify({ foo: 1 }));
    const got = await idbStorage.getItem('zustand-test');
    expect(got).toBe(JSON.stringify({ foo: 1 }));
  });

  it('handles large payloads (saves can be many MB)', async () => {
    // 1 MB string — well under IndexedDB's per-record limit but enough to
    // catch regressions where setItem accidentally truncates or fails.
    const big = 'x'.repeat(1_000_000);
    await setItem('test-key', big);
    const got = await getItem('test-key');
    expect(got?.length).toBe(1_000_000);
  });
});
