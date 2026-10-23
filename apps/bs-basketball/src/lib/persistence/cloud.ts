/**
 * Cloud Saves for BS Hoops — mirrors each local league to the signed-in user's
 * account via the shared `@bs/core/supabase/cloud-saves` module (same
 * `cloud_saves` table Football uses; Hoops rows use `bs-hoops:*` slots).
 *
 * - IndexedDB stays the source of truth; cloud is an opt-in mirror.
 * - One row per league (`bs-hoops:<leagueId>`), gzip+base64 encoded — an
 *   end-of-season league is ~11MB of JSON and compresses ~8-10x.
 * - A small `bs-hoops:index` row lists synced leagues (name, season, phase,
 *   updatedAt) so a new device can show what's restorable without downloading
 *   every save.
 * - Pushes are debounced per league; every entry point no-ops when sync is off
 *   or the user is signed out, and never throws into the game.
 */

import {
  isCloudSyncEnabled,
  pushCloudSave,
  pullCloudSave,
  deleteCloudSave,
  type CloudSaveSlot,
} from '@bs/core/supabase/cloud-saves';

export interface CloudLeagueMeta {
  id: string;
  displayName: string;
  currentSeason: number;
  currentPhase: string;
  updatedAt: number;
}

const INDEX_SLOT: CloudSaveSlot = 'bs-hoops:index';
const PUSH_DEBOUNCE_MS = 8000;
const GZ_PREFIX = 'gz1:';

export const leagueSlot = (id: string): CloudSaveSlot => `bs-hoops:${id}`;

// ---------------------------------------------------------------------------
// Encoding (gzip → base64). Falls back to raw JSON if CompressionStream is
// unavailable; decode accepts both.
// ---------------------------------------------------------------------------

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

export async function encodeSave(json: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return json;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return GZ_PREFIX + bytesToBase64(buf);
}

export async function decodeSave(payload: string): Promise<string> {
  if (!payload.startsWith(GZ_PREFIX)) return payload;
  const bytes = base64ToBytes(payload.slice(GZ_PREFIX.length));
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

export async function readCloudIndex(): Promise<CloudLeagueMeta[]> {
  const row = await pullCloudSave(INDEX_SLOT);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.payload) as CloudLeagueMeta[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

async function upsertIndex(meta: CloudLeagueMeta | null, removeId?: string): Promise<void> {
  const current = await readCloudIndex();
  const next = current.filter(m => m.id !== (meta?.id ?? removeId));
  if (meta) next.push(meta);
  await pushCloudSave(INDEX_SLOT, JSON.stringify(next));
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

const pending = new Map<string, { json: string; meta: CloudLeagueMeta }>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Push one league right now. Returns ok/reason; never throws. */
export async function pushLeagueNow(json: string, meta: CloudLeagueMeta): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await pushCloudSave(leagueSlot(meta.id), await encodeSave(json));
    if (res.ok) await upsertIndex(meta);
    return res;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

/** Called after every local save. Debounced per league; no-op when sync is off. */
export function scheduleLeagueCloudPush(json: string, meta: CloudLeagueMeta): void {
  try {
    if (typeof window === 'undefined' || !isCloudSyncEnabled()) return;
    pending.set(meta.id, { json, meta });
    const t = timers.get(meta.id);
    if (t) clearTimeout(t);
    timers.set(meta.id, setTimeout(() => {
      timers.delete(meta.id);
      const job = pending.get(meta.id);
      pending.delete(meta.id);
      if (job) void pushLeagueNow(job.json, job.meta);
    }, PUSH_DEBOUNCE_MS));
  } catch {
    /* never disturb the local save */
  }
}

// ---------------------------------------------------------------------------
// Pull / remove
// ---------------------------------------------------------------------------

/** Download a league's JSON from the cloud, or null. */
export async function pullLeagueJson(id: string): Promise<string | null> {
  try {
    const row = await pullCloudSave(leagueSlot(id));
    if (!row) return null;
    return await decodeSave(row.payload);
  } catch {
    return null;
  }
}

export async function removeCloudLeague(id: string): Promise<boolean> {
  const res = await deleteCloudSave(leagueSlot(id));
  if (res.ok) await upsertIndex(null, id);
  return res.ok;
}
