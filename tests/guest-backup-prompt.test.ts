/**
 * Returning-guest backup prompt: when it appears, and what happens to the
 * league once the guest signs in (src/lib/guestBackup.ts).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_DISMISSALS,
  SNOOZE_MS,
  dismissGuestBackupPrompt,
  finishGuestBackup,
  localDay,
  markDeviceSignedIn,
  readGuestBackupState,
  recordGuestVisit,
  setGuestBackupIntent,
  shouldShowGuestBackupPrompt,
  type GuestBackupDeps,
} from '@/lib/guestBackup';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 10, 17, 12, 0, 0).getTime(); // local noon, so +/- hours stay on the day

function deps(over: Partial<GuestBackupDeps> = {}) {
  const calls: string[] = [];
  const d: GuestBackupDeps = {
    isSyncEnabled: () => false,
    countCloudSaves: async () => 0,
    enableSync: () => { calls.push('enable'); },
    readLocalSave: async () => '{"state":{}}',
    upload: async () => { calls.push('upload'); return { ok: true }; },
    ...over,
  };
  return { d, calls };
}

// The test runtime's own localStorage has no working methods, so give the module a plain in-memory one.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});
afterAll(() => vi.unstubAllGlobals());

describe('when the prompt shows', () => {
  it('stays hidden for a first-day guest who has not finished a season', () => {
    const s = recordGuestVisit(T0);
    expect(s.days).toBe(1);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 0, now: T0 })).toBe(false);
  });

  it('shows once the guest comes back on another day', () => {
    recordGuestVisit(T0);
    const s = recordGuestVisit(T0 + DAY);
    expect(s.days).toBe(2);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 0, now: T0 + DAY })).toBe(true);
  });

  it('counts a day once however many times the game is opened', () => {
    recordGuestVisit(T0);
    recordGuestVisit(T0 + 60_000);
    expect(recordGuestVisit(T0 + 2 * 60_000).days).toBe(1);
  });

  it('shows on day one after a finished season', () => {
    const s = recordGuestVisit(T0);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 1, now: T0 })).toBe(true);
  });

  it('treats a device first seen on an earlier day as a returning guest', () => {
    localStorage.setItem('gg-device-created', String(T0 - 3 * DAY));
    const s = recordGuestVisit(T0);
    expect(s.days).toBe(2);
    expect(s.firstDay).toBe(localDay(T0 - 3 * DAY));
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 0, now: T0 })).toBe(true);
  });

  it('does not credit a device first seen earlier today', () => {
    localStorage.setItem('gg-device-created', String(T0 - 60_000));
    expect(recordGuestVisit(T0).days).toBe(1);
  });

  it('is snoozed for a week by "Not now", then comes back', () => {
    recordGuestVisit(T0);
    recordGuestVisit(T0 + DAY);
    const s = dismissGuestBackupPrompt(T0 + DAY);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 0, now: T0 + DAY + SNOOZE_MS - 1 })).toBe(false);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 0, now: T0 + DAY + SNOOZE_MS })).toBe(true);
  });

  it('stops for good after the last dismissal', () => {
    recordGuestVisit(T0);
    recordGuestVisit(T0 + DAY);
    let s = readGuestBackupState();
    for (let i = 0; i < MAX_DISMISSALS; i++) s = dismissGuestBackupPrompt(T0 + DAY);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 5, now: T0 + 365 * DAY })).toBe(false);
  });

  it('never shows on a device that has been signed in', () => {
    recordGuestVisit(T0);
    recordGuestVisit(T0 + DAY);
    markDeviceSignedIn();
    expect(shouldShowGuestBackupPrompt(readGuestBackupState(), { seasonsCompleted: 3, now: T0 + DAY })).toBe(false);
  });

  it('is snoozed for a week when the guest taps it but backs out of signing up', () => {
    recordGuestVisit(T0);
    recordGuestVisit(T0 + DAY);
    setGuestBackupIntent(T0 + DAY);
    const s = readGuestBackupState();
    expect(s.dismissals).toBe(0);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 0, now: T0 + 2 * DAY })).toBe(false);
    expect(shouldShowGuestBackupPrompt(s, { seasonsCompleted: 0, now: T0 + DAY + SNOOZE_MS })).toBe(true);
  });

  it('survives a corrupt record', () => {
    localStorage.setItem('bs-guest-backup', '{not json');
    expect(readGuestBackupState().days).toBe(0);
    expect(recordGuestVisit(T0).days).toBe(1);
  });
});

describe('backing up after sign-in', () => {
  beforeEach(() => setGuestBackupIntent());

  it('turns sync on and uploads the league for a new account', async () => {
    const { d, calls } = deps();
    expect(await finishGuestBackup(d)).toBe('backed-up');
    expect(calls).toEqual(['enable', 'upload']);
    expect(readGuestBackupState().intent).toBe(false);
  });

  it('never uploads over a cloud save the account already has', async () => {
    const { d, calls } = deps({ countCloudSaves: async () => 1 });
    expect(await finishGuestBackup(d)).toBe('cloud-exists');
    expect(calls).toEqual([]);
    expect(readGuestBackupState().intent).toBe(false);
  });

  it('changes nothing and keeps the intent when the cloud cannot be asked', async () => {
    const { d, calls } = deps({ countCloudSaves: async () => null });
    expect(await finishGuestBackup(d)).toBe('retry-later');
    expect(calls).toEqual([]);
    expect(readGuestBackupState().intent).toBe(true);
  });

  it('leaves a device that already syncs alone', async () => {
    const { d, calls } = deps({ isSyncEnabled: () => true });
    expect(await finishGuestBackup(d)).toBe('sync-on');
    expect(calls).toEqual([]);
  });

  it('turns sync on even with no league to upload yet', async () => {
    const { d, calls } = deps({ readLocalSave: async () => null });
    expect(await finishGuestBackup(d)).toBe('sync-on');
    expect(calls).toEqual(['enable']);
  });

  it('reports an oversized league and a failed upload differently', async () => {
    const big = deps({ upload: async () => ({ ok: false, reason: 'too-large' }) });
    expect(await finishGuestBackup(big.d)).toBe('too-large');
    setGuestBackupIntent();
    const down = deps({ upload: async () => ({ ok: false, reason: 'fetch failed' }) });
    expect(await finishGuestBackup(down.d)).toBe('upload-failed');
    expect(readGuestBackupState().intent).toBe(false);
  });
});
