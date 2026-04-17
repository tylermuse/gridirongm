'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { GameTicker } from './GameTicker';
import { SpotlightPopup } from './SpotlightPopup';
import { useGameStore, flushToStorageSync } from '@/lib/engine/store';
import { getTeamColorVars } from '@/lib/teamColors';

export function GameShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const godMode = useGameStore(s => s.leagueSettings?.godMode ?? false);
  const teams = useGameStore(s => s.teams);
  const userTeamId = useGameStore(s => s.userTeamId);
  const userTeam = teams.find(t => t.id === userTeamId);

  // Global last-chance save on tab close. Zustand persist writes async, so
  // closing a tab mid-write can lose the last couple seconds of state. This
  // sync-flush lives in GameShell so it covers every in-game page, not just
  // the live-sim route.
  useEffect(() => {
    const handler = () => {
      try {
        flushToStorageSync();
      } catch { /* best-effort */ }
    };
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
    };
  }, []);

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
        <GameTicker />
        <TopBar onMenuToggle={() => setSidebarOpen(v => !v)} />
        {godMode && (
          <div className="bg-yellow-500/10 border-b border-yellow-400/30 px-4 py-1 text-center">
            <span className="text-xs font-bold text-yellow-600">God Mode Active</span>
          </div>
        )}
        <main className="flex-1 p-3 md:p-6 overflow-auto pb-20 sm:pb-6">{children}</main>
      </div>

      <SpotlightPopup />
    </div>
  );
}
