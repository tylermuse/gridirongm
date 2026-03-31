/**
 * IndexedDB storage layer for Gridiron GM save data.
 *
 * Replaces localStorage (5MB cap) with IndexedDB (hundreds of MB+).
 * Uses the `idb` library for a clean Promise-based API.
 *
 * Keys mirror the old localStorage keys:
 *   - 'gridiron-gm-autosave'
 *   - 'gridiron-gm-save-1'
 *   - 'gridiron-gm-save-2'
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'gridironGM';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

// Keys we migrate from localStorage → IndexedDB
const GAME_SAVE_KEYS = [
  'gridiron-gm-autosave',
  'gridiron-gm-save-1',
  'gridiron-gm-save-2',
];

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Core CRUD
// ---------------------------------------------------------------------------

export async function getItem(key: string): Promise<string | null> {
  const db = await getDB();
  const val = await db.get(STORE_NAME, key);
  return val ?? null;
}

export async function setItem(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, value, key);
}

export async function removeItem(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

// ---------------------------------------------------------------------------
// Zustand-compatible storage adapter
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for Zustand persist's `createJSONStorage(() => localStorage)`.
 * Returns an object with getItem / setItem / removeItem that Zustand's persist
 * middleware expects. Values are stored as raw strings (Zustand handles JSON
 * serialization itself).
 */
export const idbStorage = {
  getItem,
  setItem,
  removeItem,
};

// ---------------------------------------------------------------------------
// Flush: force-write current Zustand state to IndexedDB
// ---------------------------------------------------------------------------

const PERSIST_KEY = 'gridiron-gm-autosave';

/**
 * Force-write the current Zustand store state to IndexedDB, bypassing the
 * persist middleware's async queue. Call this before navigating away after
 * a store mutation to guarantee the write has landed.
 *
 * Accepts a getStateFn so we don't create a circular import with store.ts.
 * The caller passes `useGameStore.persist.getOptions()` or the raw state.
 *
 * @param serializedState - The JSON string to write (already partialize'd +
 *   serialized by the persist middleware). If not provided, falls back to
 *   triggering the persist middleware's rehydration-safe manual save.
 */
export async function flushPersist(serializedState: string): Promise<void> {
  await setItem(PERSIST_KEY, serializedState);
}

/**
 * Synchronous fallback for beforeunload: writes a recovery copy to
 * localStorage. The app checks this during rehydration and prefers it
 * over stale IndexedDB data when present.
 */
export function flushPersistSync(serializedState: string): void {
  try {
    localStorage.setItem(PERSIST_KEY + '-recovery', serializedState);
  } catch {
    // localStorage full or unavailable — nothing we can do synchronously
  }
}

/**
 * Check for and consume a recovery snapshot written by beforeunload.
 * Returns the snapshot string if found, null otherwise.
 */
export function consumeRecoverySnapshot(): string | null {
  try {
    const snapshot = localStorage.getItem(PERSIST_KEY + '-recovery');
    if (snapshot) {
      localStorage.removeItem(PERSIST_KEY + '-recovery');
    }
    return snapshot;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Migration: localStorage → IndexedDB (runs once)
// ---------------------------------------------------------------------------

const MIGRATION_FLAG = 'gridiron-gm-idb-migrated';

/**
 * If the user has save data in localStorage, copy it to IndexedDB then delete
 * from localStorage. Safe to call multiple times — the migration flag prevents
 * duplicate work.
 *
 * Returns true if a migration was performed.
 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  // Already migrated
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(MIGRATION_FLAG)) return false;

  let migrated = false;

  for (const key of GAME_SAVE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      await setItem(key, raw);
      localStorage.removeItem(key);
      migrated = true;
    }
  }

  // Set flag so we never re-run
  localStorage.setItem(MIGRATION_FLAG, '1');
  return migrated;
}
