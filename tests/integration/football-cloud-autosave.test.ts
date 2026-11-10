/**
 * Football cloud autosave: compressed, in its own cloud slot.
 *
 * A league over 20 MB of JSON stopped syncing when the upload size limit went
 * in (see MAX_CLOUD_PAYLOAD_CHARS), so the autosave is now gzip-compressed
 * before upload. A browser tab that loaded before this shipped keeps running
 * the old code, which copies whatever it pulls from the cloud straight into
 * the local save; handed a compressed payload it would destroy that device's
 * save. The compressed copy therefore lives in a slot old clients never read
 * (`gridiron-gm-autosave-v2`), and nothing but raw JSON is ever written to
 * the one they do (`gridiron-gm-autosave`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Row { user_id: string; slot: string; payload: string; device_id: string | null; updated_at: string }

// An in-memory stand-in for the `cloud_saves` table, keyed by slot (one user).
const table = new Map<string, Row>();
const uploads: Row[] = [];
let readsFail = false;
let uploadGate: Promise<void> | null = null;

vi.mock('../../packages/core/src/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      upsert: async (row: Row) => {
        uploads.push(row);
        if (uploadGate) await uploadGate;
        table.set(row.slot, { ...row });
        return { error: null };
      },
      select: (columns: string) => {
        const filters: ((r: Row) => boolean)[] = [];
        const project = (r: Row) =>
          columns === '*'
            ? r
            : Object.fromEntries(columns.split(',').map(c => c.trim()).map(c => [c, r[c as keyof Row]]));
        const rows = () => [...table.values()].filter(r => filters.every(f => f(r))).map(project);
        const down = { data: null, error: { message: 'network down' } };
        const chain = {
          eq: (col: keyof Row, val: string) => { filters.push(r => r[col] === val); return chain; },
          in: (col: keyof Row, vals: string[]) => { filters.push(r => vals.includes(String(r[col]))); return chain; },
          maybeSingle: async () => (readsFail ? down : { data: rows()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => void) => resolve(readsFail ? down : { data: rows(), error: null }),
        };
        return chain;
      },
    }),
  }),
}));

import {
  MAX_CLOUD_PAYLOAD_CHARS,
  decodeSave,
  encodeSave,
  getCloudSyncProblem,
  isEncodedSave,
  pullCloudSave,
  pushCloudSave,
  setCloudSyncEnabled,
} from '@bs/core/supabase/cloud-saves';
import { getItem } from '@bs/core/storage';
import {
  AUTOSAVE_SLOT,
  LEGACY_AUTOSAVE_SLOT,
  peekCloudAutosave,
  pullCloudAutosave,
  pushCloudAutosaveNow,
  scheduleCloudAutosavePush,
} from '@/lib/data/cloudAutosave';
import { flushToStorage, useGameStore, whenSaveLoadSettles } from '@/lib/engine/store';

/**
 * A client from before compression, as it behaves forever (its code is
 * already in people's open tabs): raw JSON into the one slot it knows, and
 * whatever it pulls from that slot becomes the local save, unexamined.
 */
const oldClient = {
  push: (json: string) => pushCloudSave(LEGACY_AUTOSAVE_SLOT, json),
  restore: async () => (await pullCloudSave(LEGACY_AUTOSAVE_SLOT))?.payload ?? null,
};

/** What the store hands the cloud: the persisted league in its save envelope. */
function serializedLeague(): string {
  const { partialize, version } = useGameStore.persist.getOptions();
  return JSON.stringify({ state: partialize!(useGameStore.getState()), version });
}

const save = (label: string) => JSON.stringify({ state: { teams: [{ id: 't1' }], players: [{ id: 'p1' }], label }, version: 36 });

function useDevice(id: string) {
  localStorage.setItem('bs-cloud-device-id', id);
}

beforeEach(() => {
  // The test runtime's own localStorage has no working methods.
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  table.clear();
  uploads.length = 0;
  readsFail = false;
  uploadGate = null;
  setCloudSyncEnabled(true);
  useDevice('device-a');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('save encoding', () => {
  it('round-trips a real Football league exactly and shrinks it at least fivefold', async () => {
    await whenSaveLoadSettles();
    await useGameStore.getState().newLeague('');
    const json = serializedLeague();
    expect(json.length).toBeGreaterThan(1_000_000); // a real league, not a stub

    const encoded = await encodeSave(json);
    expect(isEncodedSave(encoded)).toBe(true);
    expect(encoded.length).toBeLessThan(json.length / 5);
    expect(await decodeSave(encoded)).toBe(json);
  });

  it('survives names outside ASCII', async () => {
    const json = JSON.stringify({ state: { players: [{ lastName: 'Añonuevo-Ōtani', note: '🏈 “quoted”' }] } });
    expect(await decodeSave(await encodeSave(json))).toBe(json);
  });

  it('returns a legacy raw JSON payload unchanged', async () => {
    const raw = save('from before compression');
    expect(isEncodedSave(raw)).toBe(false);
    expect(await decodeSave(raw)).toBe(raw);
  });

  it('rejects a damaged compressed payload instead of returning garbage', async () => {
    const encoded = await encodeSave(save('x'.repeat(5000)));
    const damaged = encoded.slice(0, 40) + 'AAAAAAAAAAAAAAAA' + encoded.slice(56);
    await expect(decodeSave(damaged)).rejects.toThrow();
  });
});

describe('size limit applies to what is sent', () => {
  it('uploads a league whose JSON is over the limit once it compresses under it', async () => {
    const row = JSON.stringify({ id: 'p', stats: { gamesPlayed: 0, passYards: 0, rushYards: 0, tackles: 0 } });
    const json = `{"state":{"players":[${Array(Math.ceil((MAX_CLOUD_PAYLOAD_CHARS + 1) / (row.length + 1))).fill(row).join(',')}]}}`;
    expect(json.length).toBeGreaterThan(MAX_CLOUD_PAYLOAD_CHARS);

    expect(await pushCloudAutosaveNow(json)).toEqual({ ok: true });
    expect(uploads).toHaveLength(1);
    expect(uploads[0].slot).toBe(AUTOSAVE_SLOT);
    expect(uploads[0].payload.length).toBeLessThan(MAX_CLOUD_PAYLOAD_CHARS);
    expect(getCloudSyncProblem()).toBeNull();
    expect(await pullCloudAutosave()).toBe(json);
  }, 60_000);

  it('still refuses a league that is over the limit after compression', async () => {
    // Random text barely compresses, so its encoded form stays over the limit.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const bytes = new Uint8Array(65536);
    const parts: string[] = [];
    for (let made = 0; made < MAX_CLOUD_PAYLOAD_CHARS + 2_000_000; made += bytes.length) {
      crypto.getRandomValues(bytes);
      let chunk = '';
      for (let i = 0; i < bytes.length; i++) chunk += alphabet[bytes[i] & 63];
      parts.push(chunk);
    }
    const json = `{"state":{"blob":"${parts.join('')}"}}`;
    expect((await encodeSave(json)).length).toBeGreaterThan(MAX_CLOUD_PAYLOAD_CHARS);

    expect(await pushCloudAutosaveNow(json)).toEqual({ ok: false, reason: 'too-large' });
    expect(uploads).toHaveLength(0);
    expect(getCloudSyncProblem()).toBe('too-large');
  }, 60_000);
});

describe('old and new clients sharing one account', () => {
  it('new client saves: compressed, in the new slot, and the old slot is not written', async () => {
    await pushCloudAutosaveNow(save('new'));
    expect([...table.keys()]).toEqual([AUTOSAVE_SLOT]);
    expect(isEncodedSave(table.get(AUTOSAVE_SLOT)!.payload)).toBe(true);
  });

  it('new saves, old restores: the old client sees no cloud save at all', async () => {
    await pushCloudAutosaveNow(save('new'));
    expect(await oldClient.restore()).toBeNull();
  });

  it('old saved earlier, new saves, old restores: the old client gets its last raw save, never a compressed one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-11-10T10:00:00Z');
    await oldClient.push(save('old week 3'));
    vi.setSystemTime('2026-11-10T11:00:00Z');
    await pushCloudAutosaveNow(save('new week 9'));

    const restored = await oldClient.restore();
    expect(restored).toBe(save('old week 3'));
    expect(isEncodedSave(restored!)).toBe(false);
    expect(() => JSON.parse(restored!)).not.toThrow();
  });

  it('new saves, new restores: the decoded save, exactly', async () => {
    await pushCloudAutosaveNow(save('new'));
    useDevice('device-b');
    expect(await peekCloudAutosave()).toMatchObject({ slot: AUTOSAVE_SLOT, device_id: 'device-a' });
    expect(await pullCloudAutosave()).toBe(save('new'));
  });

  it('old saves, new restores: falls back to the raw slot', async () => {
    await oldClient.push(save('old'));
    useDevice('device-b');
    expect(await peekCloudAutosave()).toMatchObject({ slot: LEGACY_AUTOSAVE_SLOT, device_id: 'device-a' });
    expect(await pullCloudAutosave()).toBe(save('old'));
  });

  it('both slots hold a save: the new client takes whichever was written last', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-11-10T10:00:00Z');
    await pushCloudAutosaveNow(save('new, earlier'));
    vi.setSystemTime('2026-11-10T11:00:00Z');
    useDevice('device-b');
    await oldClient.push(save('old, later'));

    useDevice('device-a');
    expect(await peekCloudAutosave()).toEqual({ slot: LEGACY_AUTOSAVE_SLOT, device_id: 'device-b', updated_at: '2026-11-10T11:00:00.000Z' });
    expect(await pullCloudAutosave()).toBe(save('old, later'));

    vi.setSystemTime('2026-11-10T12:00:00Z');
    await pushCloudAutosaveNow(save('new, latest'));
    useDevice('device-b');
    expect(await peekCloudAutosave()).toEqual({ slot: AUTOSAVE_SLOT, device_id: 'device-a', updated_at: '2026-11-10T12:00:00.000Z' });
    expect(await pullCloudAutosave()).toBe(save('new, latest'));
    // ...while an old client on that account still only ever sees raw JSON.
    expect(await oldClient.restore()).toBe(save('old, later'));
  });

  it('written in the same instant: the new slot wins', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-11-10T10:00:00Z');
    await oldClient.push(save('old'));
    await pushCloudAutosaveNow(save('new'));
    expect(await pullCloudAutosave()).toBe(save('new'));
  });

  it('no cloud save: nothing to restore', async () => {
    expect(await peekCloudAutosave()).toBeNull();
    expect(await pullCloudAutosave()).toBeNull();
  });

  it('a failed lookup restores nothing rather than an older slot', async () => {
    await oldClient.push(save('old'));
    await pushCloudAutosaveNow(save('new'));
    readsFail = true;
    expect(await peekCloudAutosave()).toBeNull();
    expect(await pullCloudAutosave()).toBeNull();
  });

  it('a damaged cloud copy restores nothing, so the local save is left alone', async () => {
    await pushCloudAutosaveNow(save('new'));
    const row = table.get(AUTOSAVE_SLOT)!;
    table.set(AUTOSAVE_SLOT, { ...row, payload: row.payload.slice(0, 30) });
    expect(await pullCloudAutosave()).toBeNull();
  });
});

describe('debounced autosave upload', () => {
  it('does nothing while sync is off', () => {
    vi.useFakeTimers();
    setCloudSyncEnabled(false);
    scheduleCloudAutosavePush(save('a'), 100);
    vi.advanceTimersByTime(1000);
    expect(uploads).toHaveLength(0);
  });

  it('uploads only the latest save of a burst, compressed, to the new slot', async () => {
    scheduleCloudAutosavePush(save('week 1'), 30);
    scheduleCloudAutosavePush(save('week 2'), 30);
    scheduleCloudAutosavePush(save('week 3'), 30);
    await vi.waitFor(() => expect(table.has(AUTOSAVE_SLOT)).toBe(true));
    expect(uploads).toHaveLength(1);
    expect(uploads[0].slot).toBe(AUTOSAVE_SLOT);
    expect(await decodeSave(uploads[0].payload)).toBe(save('week 3'));
  });

  it('never runs two uploads at once, and sends what was saved meanwhile next', async () => {
    let release = () => {};
    uploadGate = new Promise<void>(r => { release = r; });
    scheduleCloudAutosavePush(save('first'), 10);
    await vi.waitFor(() => expect(uploads).toHaveLength(1));

    scheduleCloudAutosavePush(save('second'), 10);
    scheduleCloudAutosavePush(save('third'), 10);
    await new Promise(r => setTimeout(r, 80)); // well past the debounce
    expect(uploads).toHaveLength(1); // the first is still in flight

    uploadGate = null;
    release();
    await vi.waitFor(() => expect(uploads).toHaveLength(2));
    expect(await decodeSave(uploads[1].payload)).toBe(save('third'));
  });
});

describe('the store', () => {
  it('mirrors a flushed league to the cloud so another device restores exactly the local save', async () => {
    await whenSaveLoadSettles();
    await useGameStore.getState().newLeague('');
    await flushToStorage();
    const local = await getItem('gridiron-gm-autosave');
    expect(local).toBeTruthy();

    await vi.waitFor(() => expect(table.has(AUTOSAVE_SLOT)).toBe(true), { timeout: 10_000, interval: 100 });
    expect(table.has(LEGACY_AUTOSAVE_SLOT)).toBe(false);
    expect(uploads[0].payload.length).toBeLessThan(local!.length / 5);

    useDevice('device-b');
    expect(await pullCloudAutosave()).toBe(local);
  }, 30_000);
});
