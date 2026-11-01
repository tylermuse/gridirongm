'use client';

/**
 * App-wide "Watch Live" (football parity: its top bar offers Watch Live on
 * every page, not just the dashboard). Owns the live-viewer state at the
 * shell so any surface — the top bar, the dashboard's next-game card — can
 * sim to the user's next game and open it.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { nextMatchup } from '@/lib/dashboard/summary';
import { getBracket } from '@/lib/playoffs';
import { getDraft } from '@/lib/draft';
import { LiveViewer } from './LiveViewer';

interface WatchLiveValue {
  /** True when the user has an unplayed regular-season game to watch. */
  canWatch: boolean;
  /** Sim to the user's next game and open it live. */
  watchLive: () => Promise<void>;
}

const WatchLiveContext = createContext<WatchLiveValue>({ canWatch: false, watchLive: async () => {} });

export function WatchLiveProvider({ children }: { children: ReactNode }) {
  const league = useLeagueStore(s => s.league);
  const watchNextUserGame = useLeagueStore(s => s.watchNextUserGame);
  const [watching, setWatching] = useState<{ userGameId: string; dayGameIds: string[] } | null>(null);

  const uid = league?.userTeamId ?? null;
  const canWatch = !!league && !!uid && !getBracket(league) && !getDraft(league)
    && (() => { const m = nextMatchup(league, uid); return !!m && !m.played; })();

  const value = useMemo<WatchLiveValue>(() => ({
    canWatch,
    async watchLive() {
      const res = await watchNextUserGame();
      if (res) setWatching({ userGameId: res.userGameId, dayGameIds: res.dayGameIds });
    },
  }), [canWatch, watchNextUserGame]);

  return (
    <WatchLiveContext.Provider value={value}>
      {children}
      {watching && (
        <LiveViewer userGameId={watching.userGameId} dayGameIds={watching.dayGameIds} onClose={() => setWatching(null)} pregame />
      )}
    </WatchLiveContext.Provider>
  );
}

export function useWatchLive(): WatchLiveValue {
  return useContext(WatchLiveContext);
}
