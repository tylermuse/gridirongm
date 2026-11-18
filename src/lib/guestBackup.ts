/**
 * Returning-guest backup prompt: when to ask a guest to make an account.
 *
 * Guests play without an account and their league lives only in this
 * browser's IndexedDB. Since 2026-07-27 about 1,500 guest devices came back on
 * a second day (about 300 on five or more) without ever signing in, so their
 * franchise was one cleared cache away from gone and we had no way to reach
 * them. The prompt offers the one thing an account gives them right now: a
 * copy of the league that survives this browser.
 *
 * It is never a wall. A guest who dismisses it is left alone for a week, and
 * after MAX_DISMISSALS it stops for good.
 *
 * This file holds the rules and the small localStorage record behind them, with
 * no React, so it can be unit tested. The banner is GuestBackupPrompt.tsx.
 */

const STATE_KEY = 'bs-guest-backup';
/** Written by @bs/core/analytics/track when the device id is minted (ms). */
const DEVICE_CREATED_KEY = 'gg-device-created';

export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_DISMISSALS = 3;

export interface GuestBackupState {
  /** Local calendar day (YYYY-MM-DD) of the first visit this record saw. */
  firstDay: string | null;
  /** Local calendar day of the latest visit. */
  lastDay: string | null;
  /** Distinct local days this device has opened the game. */
  days: number;
  dismissals: number;
  /** ms timestamp; the prompt stays hidden until then. */
  snoozeUntil: number;
  /** The guest tapped the prompt and went to sign up: back the save up on sign-in. */
  intent: boolean;
  /** This device has been signed in at some point, so it is not a guest device. */
  everSignedIn: boolean;
}

const EMPTY: GuestBackupState = {
  firstDay: null,
  lastDay: null,
  days: 0,
  dismissals: 0,
  snoozeUntil: 0,
  intent: false,
  everSignedIn: false,
};

export function localDay(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function readGuestBackupState(): GuestBackupState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<GuestBackupState>;
    return {
      firstDay: typeof parsed.firstDay === 'string' ? parsed.firstDay : null,
      lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : null,
      days: Number.isFinite(parsed.days) ? Number(parsed.days) : 0,
      dismissals: Number.isFinite(parsed.dismissals) ? Number(parsed.dismissals) : 0,
      snoozeUntil: Number.isFinite(parsed.snoozeUntil) ? Number(parsed.snoozeUntil) : 0,
      intent: parsed.intent === true,
      everSignedIn: parsed.everSignedIn === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(state: GuestBackupState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / storage full: the prompt just won't remember */
  }
}

function update(patch: Partial<GuestBackupState>): GuestBackupState {
  const next = { ...readGuestBackupState(), ...patch };
  write(next);
  return next;
}

/** When the analytics layer first saw this device (ms), or null if unknown. */
function deviceCreatedAt(): number | null {
  try {
    const n = Number(localStorage.getItem(DEVICE_CREATED_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Count today's visit. Safe to call on every page load; a day counts once. */
export function recordGuestVisit(now: number = Date.now()): GuestBackupState {
  const state = readGuestBackupState();
  const today = localDay(now);
  if (state.lastDay === today) return state;
  let { firstDay, days } = state;
  if (!firstDay) {
    firstDay = today;
    days = 1;
    // A device that was already playing before this shipped is a returning
    // guest on day one, not a newcomer: credit the earlier day.
    const created = deviceCreatedAt();
    if (created !== null && localDay(created) < today) {
      firstDay = localDay(created);
      days = 2;
    }
  } else {
    days += 1;
  }
  const next = { ...state, firstDay, lastDay: today, days };
  write(next);
  return next;
}

/**
 * Whether to show the prompt to a signed-out player right now. The save has
 * to be worth protecting: they came back on another day, or finished a season.
 */
export function shouldShowGuestBackupPrompt(
  state: GuestBackupState,
  opts: { seasonsCompleted: number; now?: number },
): boolean {
  if (state.everSignedIn) return false;
  if (state.dismissals >= MAX_DISMISSALS) return false;
  if ((opts.now ?? Date.now()) < state.snoozeUntil) return false;
  return state.days >= 2 || opts.seasonsCompleted >= 1;
}

/** "Not now": hide it for a week (and for good after MAX_DISMISSALS). */
export function dismissGuestBackupPrompt(now: number = Date.now()): GuestBackupState {
  const state = readGuestBackupState();
  return update({ dismissals: state.dismissals + 1, snoozeUntil: now + SNOOZE_MS });
}

/**
 * The guest tapped "Back up my franchise" and is off to sign up. If they back
 * out of the login page instead, that is a "not now" too: leave them alone for
 * a week, without counting it toward MAX_DISMISSALS.
 */
export function setGuestBackupIntent(now: number = Date.now()): void {
  update({ intent: true, snoozeUntil: now + SNOOZE_MS });
}

export function clearGuestBackupIntent(): void {
  update({ intent: false });
}

/** Called once a signed-in user is seen, so signing out later doesn't bring the guest prompt back. */
export function markDeviceSignedIn(): void {
  if (!readGuestBackupState().everSignedIn) update({ everSignedIn: true });
}

// ---------------------------------------------------------------------------
// After sign-in: actually back the league up
//
// Cloud sync is opt-in per device (Settings > Cloud Saves), so an account on
// its own protects nothing. A guest who signed up from the prompt asked for a
// backup, so turn sync on for them and upload the league straight away.
// ---------------------------------------------------------------------------

export type GuestBackupOutcome =
  /** The league is in the cloud now. */
  | 'backed-up'
  /** Sync is on but there was nothing to upload yet (or it was on already). */
  | 'sync-on'
  /** The account already holds a cloud save, which we must not overwrite. */
  | 'cloud-exists'
  /** Sync is on, but this league is over the upload size limit. */
  | 'too-large'
  /** Sync is on; this upload failed and the next autosave will try again. */
  | 'upload-failed'
  /** Could not ask the cloud what it has. Nothing changed; try again later. */
  | 'retry-later';

export interface GuestBackupDeps {
  isSyncEnabled(): boolean;
  /** How many cloud saves the account already has; null when the lookup failed. */
  countCloudSaves(): Promise<number | null>;
  enableSync(): void;
  /** The serialized local autosave, or null when there is none. */
  readLocalSave(): Promise<string | null>;
  upload(json: string): Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Run once a guest who tapped the prompt is signed in. Clears the intent on
 * every outcome except 'retry-later'. Never overwrites an existing cloud save:
 * someone signing in to an account they already use elsewhere chooses which
 * league to keep themselves.
 */
export async function finishGuestBackup(deps: GuestBackupDeps): Promise<GuestBackupOutcome> {
  if (deps.isSyncEnabled()) {
    clearGuestBackupIntent();
    return 'sync-on';
  }
  const existing = await deps.countCloudSaves();
  if (existing === null) return 'retry-later';
  if (existing > 0) {
    clearGuestBackupIntent();
    return 'cloud-exists';
  }
  deps.enableSync();
  clearGuestBackupIntent();
  const json = await deps.readLocalSave();
  if (!json) return 'sync-on';
  const res = await deps.upload(json);
  if (res.ok) return 'backed-up';
  return res.reason === 'too-large' ? 'too-large' : 'upload-failed';
}
