/**
 * Football's cloud autosave: the league mirrored to the signed-in user's
 * account, gzip-compressed (see encodeSave in @bs/core/supabase/cloud-saves).
 *
 * Two cloud slots exist, because a browser tab that loaded before compression
 * shipped keeps running the old code until it is reloaded, and that code
 * copies whatever it pulls straight into the local save:
 *
 *   gridiron-gm-autosave      raw JSON. All an old client reads or writes.
 *                             This module reads it and never writes it.
 *   gridiron-gm-autosave-v2   compressed. Written and read only here.
 *
 * So an old client can never be handed a compressed payload. Whichever slot
 * was written most recently is the cloud save: a league last played on an old
 * client is still found in the raw slot, and once every device runs this code
 * the raw slot just stops changing.
 *
 * The local IndexedDB autosave is always raw JSON, on old and new clients
 * alike. Only the copy in transit and at rest in the cloud is compressed.
 */

import {
  decodeSave,
  encodeSave,
  isCloudSyncEnabled,
  isEncodedSave,
  peekCloudSaves,
  pullCloudSave,
  pushCloudSave,
  type CloudSaveSlot,
} from '@bs/core/supabase/cloud-saves';

/** Raw-JSON slot shared with clients from before compression. Read-only here. */
export const LEGACY_AUTOSAVE_SLOT = 'gridiron-gm-autosave' satisfies CloudSaveSlot;
/** Compressed slot. */
export const AUTOSAVE_SLOT = 'gridiron-gm-autosave-v2' satisfies CloudSaveSlot;

const PUSH_DEBOUNCE_MS = 3000;

export interface CloudAutosaveInfo {
  slot: CloudSaveSlot;
  device_id: string | null;
  updated_at: string;
}

/**
 * Compress the serialized autosave and upload it now. The size limit
 * (MAX_CLOUD_PAYLOAD_CHARS) is applied by pushCloudSave to the compressed
 * payload, the one that is actually sent. Never throws.
 */
export async function pushCloudAutosaveNow(json: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await pushCloudSave(AUTOSAVE_SLOT, await encodeSave(json));
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

let pendingJson: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let uploading = false;

async function uploadPending(): Promise<void> {
  // One upload at a time: a slow one must not have a second league-sized
  // request stacked on top of it. Whatever was saved meanwhile goes next.
  if (uploading) return;
  uploading = true;
  try {
    // A save that arrives during the upload re-arms the timer, which will
    // come back here; only loop for one that is already due.
    while (pendingJson !== null && timer === null) {
      const json = pendingJson;
      pendingJson = null;
      await pushCloudAutosaveNow(json);
    }
  } finally {
    uploading = false;
  }
}

/**
 * Mirror the autosave to the cloud after a quiet spell. Safe to call on every
 * local save: it does nothing when sync is off, keeps only the latest save,
 * and compresses once, when the burst has settled. Fire-and-forget.
 */
export function scheduleCloudAutosavePush(json: string, debounceMs = PUSH_DEBOUNCE_MS): void {
  try {
    if (!isCloudSyncEnabled()) return;
    pendingJson = json;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void uploadPending();
    }, debounceMs);
  } catch {
    /* never disturb the local save */
  }
}

/**
 * Who last saved to the cloud and when, without downloading the save: the
 * more recently written of the two slots. Null when there is no cloud save,
 * the user is signed out, or the lookup failed. Never throws.
 */
export async function peekCloudAutosave(): Promise<CloudAutosaveInfo | null> {
  const rows = await peekCloudSaves([AUTOSAVE_SLOT, LEGACY_AUTOSAVE_SLOT]);
  if (!rows) return null;
  const current = rows.find(r => r.slot === AUTOSAVE_SLOT);
  const legacy = rows.find(r => r.slot === LEGACY_AUTOSAVE_SLOT);
  // The raw slot wins only when an old client has saved since the last
  // compressed save; on a tie, the slot current clients write wins.
  const legacyIsNewer = !!legacy && (!current || Date.parse(legacy.updated_at) > Date.parse(current.updated_at));
  const pick = legacyIsNewer ? legacy : current;
  if (!pick) return null;
  return { slot: legacyIsNewer ? LEGACY_AUTOSAVE_SLOT : AUTOSAVE_SLOT, device_id: pick.device_id, updated_at: pick.updated_at };
}

/**
 * Download the cloud autosave and return it as the serialized save, ready to
 * be written to the local autosave key. Null when there is nothing to
 * restore or it could not be downloaded or decoded: the caller must leave the
 * local save alone in that case. Never throws.
 */
export async function pullCloudAutosave(): Promise<string | null> {
  try {
    const info = await peekCloudAutosave();
    if (!info) return null;
    const row = await pullCloudSave(info.slot);
    if (!row?.payload) return null;
    const json = await decodeSave(row.payload);
    // Last line of defence for the local save: only ever hand back something
    // that is a JSON object, never a payload that is still encoded.
    if (isEncodedSave(json) || !/^\s*\{/.test(json)) return null;
    return json;
  } catch {
    return null;
  }
}
