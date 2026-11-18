'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { useGameStore, flushPendingSave } from '@/lib/engine/store';
import { AUTOSAVE_SLOT, LEGACY_AUTOSAVE_SLOT, pushCloudAutosaveNow } from '@/lib/data/cloudAutosave';
import { createClient } from '@bs/core/supabase/client';
import { getCloudSyncPreference, isCloudSyncEnabled, peekCloudSaves, setCloudSyncEnabled } from '@bs/core/supabase/cloud-saves';
import { getItem as idbGetItem, flushPendingWrites } from '@bs/core/storage';
import { trackEvent } from '@bs/core/analytics/track';
import {
  backupSourceFor,
  dismissGuestBackupPrompt,
  finishGuestBackup,
  markDeviceSignedIn,
  recordGuestVisit,
  setGuestBackupIntent,
  shouldShowGuestBackupPrompt,
  type BackupSource,
  type GuestBackupOutcome,
} from '@/lib/guestBackup';

type View = 'none' | 'prompt' | 'working' | 'auto-backed-up' | Exclude<GuestBackupOutcome, 'retry-later'>;

// One backup run per page load, shared by every mount of the banner
// (StrictMode double-invoke, or GameShell remounting between pages).
let inFlight: Promise<GuestBackupOutcome> | null = null;

function runBackup(source: BackupSource): Promise<GuestBackupOutcome> {
  inFlight ??= finishGuestBackup({
    isSyncEnabled: isCloudSyncEnabled,
    countCloudSaves: async () => (await peekCloudSaves([AUTOSAVE_SLOT, LEGACY_AUTOSAVE_SLOT]))?.length ?? null,
    enableSync: () => setCloudSyncEnabled(true),
    readLocalSave: async () => {
      await flushPendingWrites();
      return (await idbGetItem('gridiron-gm-autosave')) ?? null;
    },
    upload: pushCloudAutosaveNow,
  })
    .catch((): GuestBackupOutcome => 'retry-later')
    .then(outcome => {
      trackEvent('guest_backup_result', { outcome, source });
      return outcome;
    });
  return inFlight;
}

/**
 * Slim banner under the header that asks a returning guest to make an account
 * so their league is backed up, and backs up a signed-in player's league:
 * always for one who came from the banner, and for anyone else whose device
 * has never chosen whether to sync. The rules are in @/lib/guestBackup.
 */
export function GuestBackupPrompt() {
  const { user, loading } = useSubscription();
  const pathname = usePathname();
  const router = useRouter();
  const hasLeague = useGameStore(s => s.teams.length > 0 && !!s.userTeamId);
  const seasonsCompleted = useGameStore(s => Math.max(s.seasonHistory?.length ?? 0, s.champions?.length ?? 0));
  // GameShell only mounts this in the browser, once the save has loaded, so
  // localStorage is there to read. Counting the visit is once-a-day idempotent.
  const [guest] = useState(() => recordGuestVisit());
  const [authConfigured] = useState(() => !!createClient());
  const [syncPreference] = useState(() => getCloudSyncPreference());
  const [dismissed, setDismissed] = useState(false);
  const [outcome, setOutcome] = useState<GuestBackupOutcome | null>(null);
  const shownTracked = useRef(false);

  const signedIn = !loading && !!user;
  const showPrompt =
    !loading && !user && hasLeague && authConfigured && !dismissed &&
    shouldShowGuestBackupPrompt(guest, { seasonsCompleted });
  // Signed in: back the league up if they came from the prompt, or if this
  // device has never chosen whether to sync.
  const source = signedIn ? backupSourceFor(guest, syncPreference) : null;

  useEffect(() => {
    if (!showPrompt || shownTracked.current) return;
    shownTracked.current = true;
    trackEvent('guest_backup_prompt_shown', { days: guest.days, seasons: seasonsCompleted, dismissals: guest.dismissals });
  }, [showPrompt, guest, seasonsCompleted]);

  // Signed in: this is no longer a guest device; turn sync on and upload.
  useEffect(() => {
    if (!signedIn) return;
    markDeviceSignedIn();
    if (!source) return;
    let live = true;
    void runBackup(source).then(o => { if (live) setOutcome(o); });
    return () => { live = false; };
  }, [signedIn, source]);

  // Someone who came from the prompt sees every step. Someone backed up
  // without asking is only told once it has worked.
  const view: View = showPrompt
    ? 'prompt'
    : !source || dismissed
      ? 'none'
      : source === 'prompt'
        ? outcome === null ? 'working' : outcome === 'retry-later' ? 'none' : outcome
        : outcome === 'backed-up' ? 'auto-backed-up' : 'none';

  // Stay out of the way of a game being played.
  if (view === 'none' || pathname?.startsWith('/game/')) return null;

  if (view === 'prompt') {
    return (
      <Banner>
        <p className="flex-1 min-w-0 text-sm text-blue-900 dark:text-blue-200">
          <span className="font-semibold">Your franchise is only saved in this browser.</span>{' '}
          Create a free account to back it up and pick it up on any device.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              trackEvent('guest_backup_prompt_clicked', { seasons: seasonsCompleted });
              setGuestBackupIntent();
              flushPendingSave();
              router.push(`/login?mode=signup&reason=backup&next=${encodeURIComponent(pathname || '/')}`);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
          >
            Back up my franchise
          </button>
          <button
            onClick={() => {
              const state = dismissGuestBackupPrompt();
              trackEvent('guest_backup_prompt_dismissed', { dismissals: state.dismissals });
              setDismissed(true);
            }}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-blue-900/70 hover:text-blue-900 dark:text-blue-200/70 dark:hover:text-blue-200 transition-colors"
          >
            Not now
          </button>
        </div>
      </Banner>
    );
  }

  const close = (
    <button
      onClick={() => setDismissed(true)}
      aria-label="Dismiss"
      className="shrink-0 self-start sm:self-auto rounded-lg px-2 py-1.5 text-xs font-medium text-blue-900/70 hover:text-blue-900 dark:text-blue-200/70 dark:hover:text-blue-200 transition-colors"
    >
      Dismiss
    </button>
  );

  if (view === 'working') {
    return (
      <Banner>
        <p className="flex-1 min-w-0 text-sm text-blue-900 dark:text-blue-200">Backing up your franchise…</p>
      </Banner>
    );
  }

  if (view === 'auto-backed-up') {
    return (
      <Banner>
        <p className="flex-1 min-w-0 text-sm text-blue-900 dark:text-blue-200">
          <span className="font-semibold">Your franchise is now backed up to your account.</span>{' '}
          It syncs as you play, so you can load it on any device. You can turn this off in{' '}
          <Link href="/settings" className="font-semibold underline">Settings</Link>.
        </p>
        {close}
      </Banner>
    );
  }

  if (view === 'cloud-exists') {
    return (
      <Banner>
        <p className="flex-1 min-w-0 text-sm text-blue-900 dark:text-blue-200">
          <span className="font-semibold">This account already has a cloud save,</span> so this league was not uploaded over it.
          To replace the cloud save with this league, turn on Cloud Saves in{' '}
          <Link href="/settings" className="font-semibold underline">Settings</Link>.
        </p>
        {close}
      </Banner>
    );
  }

  const message: Record<Exclude<GuestBackupOutcome, 'cloud-exists' | 'retry-later'>, React.ReactNode> = {
    'backed-up': (
      <>
        <span className="font-semibold">Your franchise is backed up.</span>{' '}
        It will keep syncing to your account as you play. Sign in on any device to load it.
      </>
    ),
    'sync-on': (
      <>
        <span className="font-semibold">Cloud saves are on.</span>{' '}
        Your franchise will sync to your account as you play.
      </>
    ),
    'upload-failed': (
      <>
        <span className="font-semibold">Cloud saves are on,</span>{' '}
        but the first upload did not go through. It will try again the next time your league saves.
      </>
    ),
    'too-large': (
      <>
        <span className="font-semibold">This league is too large to back up.</span>{' '}
        Your save on this device is not affected.
      </>
    ),
  };

  return (
    <Banner>
      <p className="flex-1 min-w-0 text-sm text-blue-900 dark:text-blue-200">{message[view]}</p>
      {close}
    </Banner>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-blue-200 bg-blue-50 dark:border-blue-400/40 dark:bg-blue-950/40 px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4" role="status">
      {children}
    </div>
  );
}
