'use client';

/**
 * useLeagueOrHydrate.
 *
 * Sub-routes (/league, /team/[id], /player/[id]) call this hook to get the
 * active league. If the Zustand store is empty (e.g. the user hard-refreshed
 * or navigated directly to a URL), we auto-load the most recently saved
 * league from Dexie.
 *
 * Returns:
 *   { league, loading, error }
 *
 * The caller is responsible for rendering a loading state while
 * `loading === true && league === null`, and an error / redirect when
 * loading finishes but the league is still null (no saves at all).
 */

import { useEffect } from 'react';
import { useLeagueStore } from './leagueStore';

export function useLeagueOrHydrate() {
  const { league, loading, error, continueLatest } = useLeagueStore();

  useEffect(() => {
    if (league !== null) return;
    if (loading) return;
    // Try to load the most recent save. If there are none, the store sets
    // error to "No saved leagues found." and the page can react.
    void continueLatest();
  }, [league, loading, continueLatest]);

  return { league, loading, error };
}
