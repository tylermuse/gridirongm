/**
 * Cloud saves must never upload a payload big enough to take the database
 * down (see MAX_CLOUD_PAYLOAD_CHARS), and the page-load check must not
 * download the save.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn(async () => ({ error: null }));
const selected: string[] = [];
const maybeSingle = vi.fn(async () => ({ data: { device_id: 'other-device', updated_at: '2026-11-10T00:00:00Z' }, error: null }));

vi.mock('../packages/core/src/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      upsert,
      select: (columns: string) => {
        selected.push(columns);
        const chain = { eq: () => chain, maybeSingle };
        return chain;
      },
    }),
  }),
}));

import {
  MAX_CLOUD_PAYLOAD_CHARS,
  getCloudSyncProblem,
  peekCloudSave,
  pushCloudSave,
  scheduleCloudPush,
  setCloudSyncEnabled,
} from '../packages/core/src/supabase/cloudSaves';

const SLOT = 'gridiron-gm-autosave';
const tooBig = () => 'x'.repeat(MAX_CLOUD_PAYLOAD_CHARS + 1);

describe('cloud save size limit', () => {
  beforeEach(() => {
    // The test runtime's own localStorage has no working methods, so give the module a plain in-memory one.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    upsert.mockClear();
    selected.length = 0;
    setCloudSyncEnabled(true);
  });

  // Test files can share a worker; do not leave sync switched on for the next one.
  afterEach(() => vi.unstubAllGlobals());

  it('uploads a save within the limit', async () => {
    expect(await pushCloudSave(SLOT, '{"season":1}')).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(getCloudSyncProblem()).toBeNull();
  });

  it('accepts a save exactly at the limit', async () => {
    expect((await pushCloudSave(SLOT, 'x'.repeat(MAX_CLOUD_PAYLOAD_CHARS))).ok).toBe(true);
  });

  it('refuses an oversized save without touching the network, and says why', async () => {
    expect(await pushCloudSave(SLOT, tooBig())).toEqual({ ok: false, reason: 'too-large' });
    expect(upsert).not.toHaveBeenCalled();
    expect(getCloudSyncProblem()).toBe('too-large');
  });

  it('drops an oversized autosave instead of scheduling it', () => {
    vi.useFakeTimers();
    try {
      scheduleCloudPush(SLOT, tooBig(), 10);
      vi.advanceTimersByTime(1000);
      expect(upsert).not.toHaveBeenCalled();
      expect(getCloudSyncProblem()).toBe('too-large');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending upload when the next autosave is oversized', () => {
    vi.useFakeTimers();
    try {
      scheduleCloudPush(SLOT, '{"season":1}', 500);
      scheduleCloudPush(SLOT, tooBig(), 500);
      vi.advanceTimersByTime(5000);
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the warning once a save syncs again', async () => {
    await pushCloudSave(SLOT, tooBig());
    expect(getCloudSyncProblem()).toBe('too-large');
    await pushCloudSave(SLOT, '{"season":1}');
    expect(getCloudSyncProblem()).toBeNull();
  });

  it('stays the limit that was shown to be safe', () => {
    // 23-25 MB uploads were already slow and 90 MB ones crashed the database; do not raise this casually.
    expect(MAX_CLOUD_PAYLOAD_CHARS).toBeLessThanOrEqual(20 * 1024 * 1024);
  });
});

describe('peekCloudSave', () => {
  it('reads who saved and when, never the payload', async () => {
    selected.length = 0;
    expect(await peekCloudSave(SLOT)).toEqual({ device_id: 'other-device', updated_at: '2026-11-10T00:00:00Z' });
    expect(selected).toEqual(['device_id, updated_at']);
  });
});
