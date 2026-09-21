/**
 * @bs/core/supabase/cloud-saves — account-linked cross-device save sync.
 *
 * Additive layer over the existing IndexedDB persistence (@bs/core/storage).
 * IndexedDB stays the local source of truth + offline cache; when a user is
 * signed in AND has opted into sync, the serialized save blob is mirrored to a
 * Supabase `cloud_saves` row (RLS-scoped to the user) so a league started on
 * one device can be pulled on another.
 *
 * Design guarantees:
 * - Signed-out users are completely unaffected (every entry point no-ops).
 * - No save-shape / SAVE_VERSION change — we sync the exact serialized blob.
 * - Every function is guarded + try/catch'd so a sync failure never disturbs
 *   the local save.
 *
 * NOTE: cross-device conflict/merge UX and the pull-on-login round-trip need a
 * signed-in validation pass on a preview before this is wired to auto-merge.
 */

import { createClient } from './client';

const DEVICE_ID_KEY = 'bs-cloud-device-id';
const SYNC_ENABLED_KEY = 'bs-cloud-sync-enabled';
const LAST_SYNCED_KEY = 'bs-cloud-last-synced';

/** Save slots mirrored to the cloud — mirrors GAME_SAVE_KEYS in storage. */
export const CLOUD_SAVE_SLOTS = [
  'gridiron-gm-autosave',
  'gridiron-gm-save-1',
  'gridiron-gm-save-2',
] as const;
export type CloudSaveSlot = (typeof CLOUD_SAVE_SLOTS)[number];

export interface CloudSaveRow {
  user_id: string;
  slot: string;
  payload: string;
  device_id: string | null;
  updated_at: string;
}

export function isCloudSyncEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCloudSyncEnabled(on: boolean): void {
  try {
    localStorage.setItem(SYNC_ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* SSR / private mode — ignore */
  }
}

/** Stable per-browser device id so conflict prompts can say "another device". */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
}

export function getLastSyncedAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNCED_KEY);
  } catch {
    return null;
  }
}

function markSynced(): void {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

async function getUserId(): Promise<string | null> {
  const client = createClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Whether sync can run right now (enabled + configured + signed in). */
export async function canSync(): Promise<boolean> {
  if (!isCloudSyncEnabled()) return false;
  return (await getUserId()) !== null;
}

/** Push one slot's serialized blob to the cloud. Never throws. */
export async function pushCloudSave(
  slot: CloudSaveSlot,
  payload: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!isCloudSyncEnabled()) return { ok: false, reason: 'disabled' };
    const client = createClient();
    if (!client) return { ok: false, reason: 'no-client' };
    const userId = await getUserId();
    if (!userId) return { ok: false, reason: 'signed-out' };
    const { error } = await client
      .from('cloud_saves')
      .upsert(
        {
          user_id: userId,
          slot,
          payload,
          device_id: getDeviceId(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,slot' },
      );
    if (error) return { ok: false, reason: error.message };
    markSynced();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

/** Pull the newest cloud row for a slot, or null. Never throws. */
export async function pullCloudSave(slot: CloudSaveSlot): Promise<CloudSaveRow | null> {
  try {
    // NOTE: intentionally not gated on isCloudSyncEnabled() — reading the
    // signed-in user's own cloud row is how a fresh device discovers a save to
    // restore. A row only exists if the user opted in on some device, so a
    // user who never enabled sync sees nothing.
    const client = createClient();
    if (!client) return null;
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await client
      .from('cloud_saves')
      .select('*')
      .eq('user_id', userId)
      .eq('slot', slot)
      .maybeSingle();
    if (error) return null;
    return (data as CloudSaveRow) ?? null;
  } catch {
    return null;
  }
}

// Per-slot debounce so a burst of writes coalesces into one network push.
const _timers: Partial<Record<CloudSaveSlot, ReturnType<typeof setTimeout>>> = {};

/**
 * Debounced push for a slot. Safe to call on every local save — it no-ops when
 * sync is disabled and coalesces rapid writes. Fire-and-forget.
 */
export function scheduleCloudPush(slot: CloudSaveSlot, payload: string, debounceMs = 3000): void {
  try {
    if (!isCloudSyncEnabled()) return;
    const existing = _timers[slot];
    if (existing) clearTimeout(existing);
    _timers[slot] = setTimeout(() => {
      void pushCloudSave(slot, payload);
    }, debounceMs);
  } catch {
    /* ignore */
  }
}

/**
 * Immediately push a slot's current serialized blob, bypassing the debounce.
 * Used right after the user enables sync so a row exists to pull on device B.
 */
export async function pushCloudSaveNow(slot: CloudSaveSlot, payload: string): Promise<{ ok: boolean; reason?: string }> {
  return pushCloudSave(slot, payload);
}
