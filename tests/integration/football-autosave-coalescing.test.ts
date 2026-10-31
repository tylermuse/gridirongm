/**
 * Autosave coalescing + load gate (Tyler 10/31: the game crashed mid-sim on his
 * phone, reloaded, and showed an empty "preseason" league).
 *
 * Every store update used to serialize and write the whole league (10–20MB by
 * season 3) — 3-5 times per simmed week — which piled up enough copies to get
 * the tab killed on iOS. Writes are now coalesced to one at a time with only
 * the latest state, and nothing is autosaved until the save has loaded.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getItem, setItem, removeItem, queueWrite, flushPendingWrites } from '@bs/core/storage';
import {
  useGameStore,
  flushToStorage,
  whenSaveLoadSettles,
  retrySaveLoad,
  continueWithoutSave,
} from '@/lib/engine/store';

function counted(week: number, onSerialize: () => void) {
  return { state: { week, toJSON: () => { onSerialize(); return { week }; } }, version: 1 };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Spy on IndexedDB puts. Test files share one fake IndexedDB, and another
 *  file's store can still have an autosave queued, so count only our own. */
function spyPuts() {
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put');
  return {
    forKey: (key: string) => spy.mock.calls.filter(([, k]) => k === key),
    containing: (marker: string) => spy.mock.calls.filter(([v]) => String(v).includes(marker)),
  };
}

describe('coalesced autosave writes', () => {
  it('serializes and writes a burst of updates once, with the latest state', async () => {
    const puts = spyPuts();
    let serialized = 0;
    for (let week = 1; week <= 5; week++) queueWrite('coalesce-burst', counted(week, () => serialized++));
    await flushPendingWrites();
    expect(serialized).toBe(1);
    expect(puts.forKey('coalesce-burst')).toHaveLength(1);
    expect(JSON.parse((await getItem('coalesce-burst'))!).state.week).toBe(5);
  });

  it('writes on its own shortly after the burst settles', async () => {
    queueWrite('coalesce-timer', { state: { week: 9 }, version: 1 });
    expect(await getItem('coalesce-timer')).toBeNull();
    await new Promise(r => setTimeout(r, 700));
    await flushPendingWrites(); // waits out the in-flight write, writes nothing new
    expect(JSON.parse((await getItem('coalesce-timer'))!).state.week).toBe(9);
  });

  it('a long Sim Season loop still saves every couple of seconds, not only at the end', async () => {
    const putAt: number[] = [];
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, v, k) {
      if (k === 'coalesce-season') putAt.push(performance.now());
      return put.call(this, v, k);
    });
    const startedAt = performance.now();
    for (let week = 1; week <= 8; week++) {
      const busyUntil = performance.now() + 330; // simWeek blocks the main thread
      while (performance.now() < busyUntil) { /* sim */ }
      for (let i = 0; i < 4; i++) queueWrite('coalesce-season', { state: { week, i }, version: 1 });
      await new Promise(r => setTimeout(r, 0)); // handleSimSeason's yield
    }
    const loopEndedAt = performance.now();
    await flushPendingWrites();
    expect(putAt.filter(t => t < loopEndedAt).length).toBeGreaterThanOrEqual(1);
    expect(putAt[0] - startedAt).toBeLessThan(2000 + 330 * 2);
  });

  it('a direct write supersedes a queued autosave (slot load before reload)', async () => {
    queueWrite('coalesce-direct', { state: { league: 'old in-memory' }, version: 1 });
    await setItem('coalesce-direct', JSON.stringify({ state: { league: 'loaded slot' }, version: 1 }));
    await flushPendingWrites();
    expect(JSON.parse((await getItem('coalesce-direct'))!).state.league).toBe('loaded slot');
  });

  it('removeItem drops a queued autosave for that key', async () => {
    queueWrite('coalesce-remove', { state: { week: 3 }, version: 1 });
    await removeItem('coalesce-remove');
    await flushPendingWrites();
    expect(await getItem('coalesce-remove')).toBeNull();
  });
});

describe('save-wipe guard', () => {
  it('still saves a real league whose JSON happens to contain the empty-roster substrings', async () => {
    const key = 'guard-nested';
    await setItem(key, JSON.stringify({ state: { teams: [{ id: 't1' }], players: [{ id: 'p1' }] } }));
    const next = JSON.stringify({
      state: {
        teams: [{ id: 't1' }, { id: 't2' }],
        players: [{ id: 'p1' }],
        expansionDraft: { teams: [], players: [] },
      },
    });
    await setItem(key, next);
    expect(await getItem(key)).toBe(next);
  });
});

describe('store autosave', () => {
  it('a sim-sized burst of store updates becomes one autosave write', async () => {
    expect(await whenSaveLoadSettles()).toBe('ready');
    // A real (non-empty) league, so the save-wipe guard lets it through.
    useGameStore.setState({ teams: [{ id: 't1' }] as never, players: [{ id: 'p1' }] as never });
    await flushPendingWrites();
    const puts = spyPuts();
    for (let i = 1; i <= 5; i++) useGameStore.setState({ week: 9000 + i });
    await flushPendingWrites();
    expect(puts.containing('"week":900')).toHaveLength(1);
    expect(puts.containing('"week":9005')).toHaveLength(1);
  });

  it('after a failed load nothing is autosaved, and a retry recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(() => {
      throw new DOMException('read failed', 'UnknownError');
    });
    expect(await retrySaveLoad()).toBe('failed');

    const puts = spyPuts();
    useGameStore.setState({ week: 8101, phase: 'regular' });
    await flushToStorage();
    await flushPendingWrites();
    expect(puts.containing('"week":8101')).toHaveLength(0);

    get.mockRestore();
    expect(await retrySaveLoad()).toBe('ready');
  });

  it('continuing without the save turns autosave back on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(() => {
      throw new DOMException('read failed', 'UnknownError');
    });
    expect(await retrySaveLoad()).toBe('failed');
    continueWithoutSave();
    const puts = spyPuts();
    useGameStore.setState({ week: 8202, teams: [{ id: 'new' }] as never, players: [{ id: 'p' }] as never });
    await flushToStorage();
    expect(puts.containing('"week":8202')).toHaveLength(1);
  });
});
