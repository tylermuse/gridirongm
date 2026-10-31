/**
 * @bs/core/storage — IndexedDB persistence layer.
 *
 * Promoted from apps/web/src/lib/storage.ts during Sub-phase 1D.
 *
 * Replaces localStorage (5MB cap) with IndexedDB (hundreds of MB+) for game
 * save data. Uses the `idb` library for a clean Promise-based API.
 *
 * The game store's persist middleware reads with getItem and autosaves through
 * queueWrite (coalesced, see below); `idbStorage` is the raw string adapter.
 *
 * Browser-only — calling these from a Node/server context will throw or
 * be no-ops behind the `typeof window` guards.
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

/** Total roster size (teams + players) of a serialized persist payload, or 0 if
 *  it can't be parsed / isn't a game-save shape. Payload is `{state:{…}}` (persist
 *  middleware) or a raw state object. */
function rosterCount(serialized: string): number {
  try {
    const parsed = JSON.parse(serialized) as { state?: unknown } | Record<string, unknown>;
    const st = ((parsed as { state?: unknown }).state ?? parsed) as {
      teams?: unknown[];
      players?: unknown[];
    };
    const t = Array.isArray(st?.teams) ? st.teams.length : 0;
    const p = Array.isArray(st?.players) ? st.players.length : 0;
    return t + p;
  } catch {
    return 0;
  }
}

/** True when a serialized payload carries an EMPTY roster (both teams and players
 *  empty). Fast substring pre-check so a normal (non-empty) save never pays a
 *  full JSON.parse. */
function isEmptyRosterPayload(serialized: string): boolean {
  return serialized.includes('"teams":[]') && serialized.includes('"players":[]');
}

/** Guarded write of a serialized value. Shared by the public setItem and the
 *  coalesced autosave writer below. */
async function writeValue(key: string, value: string): Promise<void> {
  const db = await getDB();
  // Save-wipe guard (vulcan832 — overnight full save loss): a silent auth-token
  // expiry or hydration failure can reset the store to its initial empty state.
  // Without this, the next autosave would then stomp a good save with empty
  // teams+players. Never let an empty-roster payload overwrite a save that still
  // has data — bail loudly instead. Fast-pathed on the substring so normal
  // writes skip both the parse and the extra read; the substrings can also
  // appear nested inside a real save, so confirm the incoming roster really is
  // empty before refusing the write.
  if (isEmptyRosterPayload(value) && rosterCount(value) === 0) {
    const existing = await db.get(STORE_NAME, key);
    if (typeof existing === 'string' && rosterCount(existing) > 0) {
      console.error(
        `[storage] Blocked an empty-roster write over a non-empty save ("${key}") — save-wipe guard. ` +
          `The in-memory store was empty (likely a failed load/auth refresh); keeping the existing save.`,
      );
      return;
    }
  }
  await db.put(STORE_NAME, value, key);
}

/** Write a serialized value. A direct write (or removeItem) supersedes any
 *  queued autosave for that key — e.g. loading a slot over the autosave right
 *  before a reload must not be stomped by the old in-memory league. */
export async function setItem(key: string, value: string): Promise<void> {
  pendingWrites.delete(key);
  await writeValue(key, value);
}

export async function removeItem(key: string): Promise<void> {
  pendingWrites.delete(key);
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
// Coalesced persist storage
// ---------------------------------------------------------------------------

/** The `{ state, version }` envelope zustand's persist middleware hands to a
 *  PersistStorage. Typed structurally so core doesn't depend on zustand. */
export interface PersistEnvelope<S = unknown> {
  state: S;
  version?: number;
}

const WRITE_DEBOUNCE_MS = 500;
const WRITE_MAX_WAIT_MS = 2000;

const pendingWrites = new Map<string, PersistEnvelope>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let firstPendingAt = 0;
let draining: Promise<void> | null = null;

async function runDrain(): Promise<void> {
  while (pendingWrites.size > 0) {
    const [key, envelope] = pendingWrites.entries().next().value as [string, PersistEnvelope];
    pendingWrites.delete(key);
    try {
      await writeValue(key, JSON.stringify(envelope));
    } catch (err) {
      console.error(`[storage] Autosave write failed ("${key}")`, err);
    }
  }
}

/** Start writing whatever is pending, one write at a time. Returns the running
 *  drain if one is already going (it picks up anything queued meanwhile). */
function drainWrites(): Promise<void> {
  if (!draining) {
    draining = runDrain().finally(() => {
      draining = null;
    });
  }
  return draining;
}

function scheduleDrain(): void {
  const now = Date.now();
  if (writeTimer) clearTimeout(writeTimer);
  else firstPendingAt = now;
  writeTimer = null;
  const wait = firstPendingAt + WRITE_MAX_WAIT_MS - now;
  if (wait <= 0) {
    // A long burst (Sim Season's week-by-week loop) keeps re-arming the
    // debounce and its own setTimeout(0) yields win the race against ours, so
    // past the max wait, write as soon as the current task finishes.
    queueMicrotask(() => void drainWrites());
    return;
  }
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void drainWrites();
  }, Math.min(WRITE_DEBOUNCE_MS, wait));
}

/**
 * Write any pending autosave now and resolve once it — and any write already
 * in flight — has landed. Call before reading the autosave back out of
 * IndexedDB, before navigating away, and when the tab is hidden.
 */
export async function flushPendingWrites(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  while (draining || pendingWrites.size > 0) await drainWrites();
}

/**
 * Queue a zustand persist envelope for a coalesced write — call this from a
 * PersistStorage's setItem. The persist middleware calls setItem on every store
 * update, and a single sim fires several in a row; serializing and writing a
 * 10–20MB league each time piled up enough copies in memory to get the tab
 * killed on phones (Tyler 10/31: crash mid-sim → reload → "lost" progress).
 * Instead, keep only the latest envelope per key, serialize it once the burst
 * settles (at most WRITE_MAX_WAIT_MS later), and never have more than one write
 * in flight.
 */
export function queueWrite(key: string, envelope: PersistEnvelope): void {
  if (typeof indexedDB === 'undefined') return; // server render
  pendingWrites.set(key, envelope);
  scheduleDrain();
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
