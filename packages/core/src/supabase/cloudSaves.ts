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
 * - No save-shape / SAVE_VERSION change — we sync the exact serialized blob,
 *   optionally gzip-compressed for transport (encodeSave / decodeSave).
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
 * The largest payload we will send, in characters (about bytes: a payload is
 * ASCII JSON or, once encoded with encodeSave, ASCII base64). It applies to
 * the payload as sent, so a compressed save is measured after compression.
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

/**
 * Football's cloud slots. `gridiron-gm-autosave` holds raw JSON and is the
 * only slot clients from before compression read or write, so nothing but raw
 * JSON may ever be written to it: those clients copy what they pull straight
 * into the local save. `gridiron-gm-autosave-v2` holds an encodeSave payload
 * and is only touched by clients that decode what they pull.
 */
export const CLOUD_SAVE_SLOTS = [
  'gridiron-gm-autosave',
  'gridiron-gm-autosave-v2',
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

// ---------------------------------------------------------------------------
// Payload encoding (gzip, then base64, behind a `gz1:` prefix)
//
// A league is megabytes of repetitive JSON and compresses about tenfold. The
// encoded form is a different string from the save itself, so it must be
// decoded before it is used as a save, and must only be stored where every
// reader decodes (see CLOUD_SAVE_SLOTS).
// ---------------------------------------------------------------------------

const GZ_PREFIX = 'gz1:';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** True when a payload was produced by encodeSave and needs decodeSave. */
export function isEncodedSave(payload: string): boolean {
  return payload.startsWith(GZ_PREFIX);
}

/**
 * Compress a serialized save for upload. Returns the JSON unchanged where the
 * browser has no CompressionStream; decodeSave accepts both.
 */
export async function encodeSave(json: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return json;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return GZ_PREFIX + bytesToBase64(buf);
}

/**
 * Turn a pulled payload back into the serialized save. A payload without the
 * prefix is a raw JSON save from before compression and is returned as is.
 * Throws if an encoded payload is damaged.
 */
export async function decodeSave(payload: string): Promise<string> {
  if (!isEncodedSave(payload)) return payload;
  const bytes = base64ToBytes(payload.slice(GZ_PREFIX.length));
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
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

/**
 * peekCloudSave for several slots in one request, newest first. Returns null
 * when the lookup itself failed, so a caller choosing between slots can tell
 * "no row" from "could not ask" and not settle for an older slot by mistake.
 * Never throws.
 */
export async function peekCloudSaves(
  slots: readonly CloudSaveSlot[],
): Promise<Pick<CloudSaveRow, 'slot' | 'device_id' | 'updated_at'>[] | null> {
  try {
    const client = createClient();
    if (!client) return null;
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await client
      .from('cloud_saves')
      .select('slot, device_id, updated_at')
      .eq('user_id', userId)
      .in('slot', [...slots]);
    if (error || !Array.isArray(data)) return null;
    const rows = data as Pick<CloudSaveRow, 'slot' | 'device_id' | 'updated_at'>[];
    return [...rows].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
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
