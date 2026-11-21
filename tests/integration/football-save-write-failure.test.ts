/**
 * A save that the browser refuses to write must not fail silently.
 *
 * Player report, 2026-11-17 ("it keeps going back to current after i
 * advance", Chromebook): their click trail shows a real-season league started
 * at Week 10 and simmed to Week 11, then four times in an hour they played on
 * (finished the season, re-signing, free agency) and each full page load put
 * them back at Week 11. "Advance to Draft" and "End Free Agency Early" reload
 * the page, so every attempt to reach the draft threw the session away. The
 * autosave had stopped landing, and nothing said so: a failed IndexedDB write
 * was logged to the console and dropped, flushToStorage() resolved as if it
 * had saved, and the "Save" button in Save/Load did nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/engine/gmSync', () => ({ buildGmSyncPayload: () => null, syncGmStats: vi.fn() }));

import { trackEvent } from '@bs/core/analytics/track';
import { getItem, getWriteFailure, onWriteResult, queueWrite, flushPendingWrites } from '@bs/core/storage';
import { useGameStore, flushToStorage, whenSaveLoadSettles, getSaveWriteFailure } from '@/lib/engine/store';

const AUTOSAVE = 'gridiron-gm-autosave';
const st = () => useGameStore.getState();
const savedWeek = async () => JSON.parse((await getItem(AUTOSAVE))!).state.week as number;

/** The browser refusing every write, the way a full or blocked store does. */
function storageFull() {
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storage: a failed write is reported, not dropped', () => {
  it('records the failure for the key and tells listeners', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: Array<string | null> = [];
    const off = onWriteResult((key, failure) => { if (key === 'wf-key') seen.push(failure?.name ?? null); });

    const full = storageFull();
    queueWrite('wf-key', { state: { week: 2 }, version: 1 });
    await flushPendingWrites();

    expect(getWriteFailure('wf-key')).toMatchObject({ name: 'QuotaExceededError', bytes: expect.any(Number) });
    expect(seen).toEqual(['QuotaExceededError']);

    // The next write that lands clears it.
    full.mockRestore();
    queueWrite('wf-key', { state: { week: 3 }, version: 1 });
    await flushPendingWrites();
    expect(getWriteFailure('wf-key')).toBeNull();
    expect(seen).toEqual(['QuotaExceededError', null]);
    off();
  });
});

describe('league autosave when the browser refuses the write', () => {
  it('flushToStorage says the save did not land, and the failure is tracked once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await whenSaveLoadSettles();
    await st().newLeague('DAL', undefined, 'regular');
    expect(await flushToStorage()).toBe(true);
    expect(await savedWeek()).toBe(1);
    expect(getSaveWriteFailure()).toBeNull();

    // Storage fills up. The player keeps playing.
    const full = storageFull();
    vi.mocked(trackEvent).mockClear();
    st().simWeek();
    expect(st().week).toBe(2);

    expect(await flushToStorage()).toBe(false);
    expect(getSaveWriteFailure()).toMatchObject({ name: 'QuotaExceededError' });
    // What a reload would bring back: the last save that landed.
    expect(await savedWeek()).toBe(1);

    st().simWeek();
    expect(await flushToStorage()).toBe(false);
    const tracked = vi.mocked(trackEvent).mock.calls.filter(c => c[0] === 'save_write_failed');
    expect(tracked).toHaveLength(1);
    expect(tracked[0][1]).toMatchObject({ name: 'QuotaExceededError', season: 2026, phase: 'regular' });

    // Space comes back (say, a slot is deleted): the next save lands and the warning clears.
    full.mockRestore();
    expect(await flushToStorage()).toBe(true);
    expect(getSaveWriteFailure()).toBeNull();
    expect(await savedWeek()).toBe(3);
  }, 120_000);

  it('saving to a slot rejects instead of looking like it worked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await whenSaveLoadSettles();
    await st().newLeague('DAL', undefined, 'regular');
    await flushToStorage();

    storageFull();
    await expect(st().saveToSlot(4)).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await getItem('gridiron-gm-save-4')).toBeNull();
  }, 120_000);
});
