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
const SYNC_PROBLEM_KEY = 'bs-cloud-sync-problem';

/**
 * The largest payload we will send, in characters (about bytes: saves are
 * ASCII JSON).
 *
 * On 2026-11-10 two Football leagues that had grown to 90-108 MB uploaded
 * themselves on every autosave. Each upload ran the database out of memory
 * about 40 seconds later and restarted it: 22 crashes in two and a half hours,
 * every one preceded by one of those uploads, with sign-in and saves failing
 * for everyone during each restart. Uploads of 9-10 MB took half a second and
 * 23-25 MB took 2-5 seconds, already climbing steeply, so the limit sits
 * inside the range that was plainly healthy.
 *
 * A save over the limit stays on the device, exactly as it does for someone
 * who never turned sync on; only the cloud copy stops updating, and the
 * settings page says so (getCloudSyncProblem).
 */
export const MAX_CLOUD_PAYLOAD_CHARS = 20 * 1024 * 1024;

export type CloudSyncProblem = 'too-large';

/** Why the latest save was not synced, or null when sync is healthy. */
export function getCloudSyncProblem(): CloudSyncProblem | null {
  try {
    return localStorage.getItem(SYNC_PROBLEM_KEY) === 'too-large' ? 'too-large' : null;
  } catch {
    return null;
  }
}

function setSyncProblem(problem: CloudSyncProblem | null): void {
  try {
    if (problem) localStorage.setItem(SYNC_PROBLEM_KEY, problem);
    else localStorage.removeItem(SYNC_PROBLEM_KEY);
  } catch {
    /* ignore */
  }
}

/** True (and recorded for the settings page) when a payload is too big to send. */
function refuseOversized(payload: string): boolean {
  if (payload.length <= MAX_CLOUD_PAYLOAD_CHARS) return false;
  setSyncProblem('too-large');
  return true;
}

/** Save slots mirrored to the cloud — mirrors GAME_SAVE_KEYS in storage. */
export const CLOUD_SAVE_SLOTS = [
  'gridiron-gm-autosave',
  'gridiron-gm-save-1',
  'gridiron-gm-save-2',
] as const;
/** Football's fixed slots, plus BS Hoops' per-league slots (`bs-hoops:<leagueId>`
 *  and the `bs-hoops:index` league list). The `slot` column is free text. */
export type CloudSaveSlot = (typeof CLOUD_SAVE_SLOTS)[number] | `bs-hoops:${string}`;

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
  setSyncProblem(null);
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
    // Before anything touches the network: see MAX_CLOUD_PAYLOAD_CHARS.
    if (refuseOversized(payload)) return { ok: false, reason: 'too-large' };
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

/**
 * Who last wrote a slot and when, without its payload. Never throws.
 *
 * Use this to decide whether there is anything worth restoring. The payload is
 * megabytes, and reading it on every page load made the database unpack and
 * re-encode the whole save just so the caller could compare a device id.
 */
export async function peekCloudSave(slot: CloudSaveSlot): Promise<Pick<CloudSaveRow, 'device_id' | 'updated_at'> | null> {
  try {
    const client = createClient();
    if (!client) return null;
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await client
      .from('cloud_saves')
      .select('device_id, updated_at')
      .eq('user_id', userId)
      .eq('slot', slot)
      .maybeSingle();
    if (error) return null;
    return (data as Pick<CloudSaveRow, 'device_id' | 'updated_at'>) ?? null;
  } catch {
    return null;
  }
}

/** Delete one slot's cloud row (the user removing a cloud copy). Never throws. */
export async function deleteCloudSave(slot: CloudSaveSlot): Promise<{ ok: boolean; reason?: string }> {
  try {
    const client = createClient();
    if (!client) return { ok: false, reason: 'no-client' };
    const userId = await getUserId();
    if (!userId) return { ok: false, reason: 'signed-out' };
    const { error } = await client.from('cloud_saves').delete().eq('user_id', userId).eq('slot', slot);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

/** Whether a user is signed in (Supabase configured + session). Never throws. */
export async function isSignedIn(): Promise<boolean> {
  try { return (await getUserId()) !== null; } catch { return false; }
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
    // Checked here as well as in pushCloudSave so an oversized save is dropped
    // now instead of being held in memory for the length of the debounce.
    if (refuseOversized(payload)) return;
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
