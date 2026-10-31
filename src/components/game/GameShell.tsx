'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { GameTicker } from './GameTicker';
import { GlobalBooth } from './GlobalBooth';
import { FiredModal } from './FiredModal';
import { Button } from '@/components/ui/Button';
import { useGameStore, flushPendingSave, useSaveLoadStatus, retrySaveLoad, continueWithoutSave } from '@/lib/engine/store';
import { getTeamColorVars } from '@/lib/teamColors';

export function GameShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const godMode = useGameStore(s => s.leagueSettings?.godMode ?? false);
  const teams = useGameStore(s => s.teams);
  const userTeamId = useGameStore(s => s.userTeamId);
  const userTeam = teams.find(t => t.id === userTeamId);
  const saveStatus = useSaveLoadStatus();

  // Autosaves are coalesced (written a beat after a burst of updates), so
  // write anything still queued the moment the page is hidden or closed —
  // on phones, backgrounding the browser is often the last chance. Lives in
  // GameShell so it covers every in-game page, not just the live-sim route.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingSave();
    };
    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', onVisibility);
    // Old builds stashed a full copy of the league here on every tab close;
    // nothing ever read it back.
    try { localStorage.removeItem('gridiron-gm-autosave-recovery'); } catch { /* unavailable */ }
    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (saveStatus !== 'ready') return <SaveLoadScreen status={saveStatus} />;

  return (
    <div className="flex min-h-screen" style={userTeam ? getTeamColorVars(userTeam) as React.CSSProperties : undefined}>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: always visible on md+, drawer overlay on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out md:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky header stack — pins the ticker (with the mobile hamburger)
            and the phase TopBar to the viewport top together so the menu
            button stays reachable as the user scrolls down any page. */}
        <div className="sticky top-0 z-20">
          <GameTicker onMenuToggle={() => setSidebarOpen(v => !v)} />
          <TopBar />
        </div>
        {godMode && (
          <div className="bg-yellow-500/10 border-b border-yellow-400/30 px-4 py-1 text-center">
            <span className="text-xs font-bold text-yellow-600">God Mode Active</span>
          </div>
        )}
        <main className="flex-1 p-3 md:p-6 overflow-auto pb-20 sm:pb-6">{children}</main>
      </div>

      <GlobalBooth />
      <FiredModal />
    </div>
  );
}

/** Stands in for the game while the saved league loads, or after it failed to,
 *  so a slow or failed load never shows the empty preseason league (and its
 *  sim buttons) in place of the real one. */
function SaveLoadScreen({ status }: { status: 'loading' | 'failed' }) {
  const [retrying, setRetrying] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== 'loading') return;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-[var(--text-sec)]">Loading your league…</p>
        {slow && (
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <h2 className="text-lg font-bold">Your league didn&apos;t load</h2>
        <p className="text-sm text-[var(--text-sec)]">
          Nothing has been overwritten. Try loading it again, or reload the page.
        </p>
        <Button
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await retrySaveLoad();
            setRetrying(false);
          }}
        >
          {retrying ? 'Loading…' : 'Try again'}
        </Button>
        <button
          onClick={continueWithoutSave}
          className="block mx-auto text-xs text-[var(--text-sec)] underline"
        >
          Continue without it (a new league will replace the save)
        </button>
      </div>
    </div>
  );
}
