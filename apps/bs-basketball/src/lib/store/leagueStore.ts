/**
 * BS Hoops league store.
 *
 * Zustand store holding the active BaseLeagueState. The state is large
 * (1+ MB serialized for a fresh league), so we intentionally do NOT use the
 * persist middleware — that would slam localStorage on every update. We
 * persist explicitly via the Dexie helpers in ../persistence/db.
 *
 * Flow:
 *   - newLeague(opts)        → createNewBasketballLeague + save to Dexie
 *   - loadLeague(id)         → fetch from Dexie + load into store
 *   - continueLatest()       → load most recent save
 *   - clearActive()          → drop active league from memory (saves stay)
 *
 * Saving is automatic-on-creation in v1. Later we'll add per-tick autosave
 * once we have a calendar advance flow (2C-4).
 */

'use client';

import { create } from 'zustand';
import {
  createNewBasketballLeague,
  type CreateBasketballLeagueOptions,
} from '../league/createLeague';
import {
  saveLeague,
  loadLeague as loadLeagueFromDb,
  mostRecentLeague,
  type BasketballLeagueState,
} from '../persistence/db';

interface LeagueStore {
  /** Currently loaded league, or null if user hasn't started one. */
  league: BasketballLeagueState | null;
  /** True while an async load/create is in flight. */
  loading: boolean;
  /** Last error message, or null. */
  error: string | null;

  /** Create a fresh league and persist it. */
  newLeague: (opts?: CreateBasketballLeagueOptions) => Promise<void>;

  /** Load an existing league by id. */
  loadLeague: (id: string) => Promise<void>;

  /** Continue the most recently saved league. */
  continueLatest: () => Promise<void>;

  /** Persist current in-memory league. No-op if none loaded. */
  saveActive: () => Promise<void>;

  /** Drop the active league from memory (does NOT delete the save). */
  clearActive: () => void;
}

export const useLeagueStore = create<LeagueStore>((set, get) => ({
  league: null,
  loading: false,
  error: null,

  async newLeague(opts) {
    set({ loading: true, error: null });
    try {
      const league = createNewBasketballLeague(opts);
      await saveLeague(league);
      set({ league, loading: false });
    } catch (err) {
      console.error('[bs-hoops] newLeague failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async loadLeague(id) {
    set({ loading: true, error: null });
    try {
      const league = await loadLeagueFromDb(id);
      if (!league) {
        set({ loading: false, error: 'League not found.' });
        return;
      }
      set({ league, loading: false });
    } catch (err) {
      console.error('[bs-hoops] loadLeague failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async continueLatest() {
    set({ loading: true, error: null });
    try {
      const meta = await mostRecentLeague();
      if (!meta) {
        set({ loading: false, error: 'No saved leagues found.' });
        return;
      }
      const league = await loadLeagueFromDb(meta.id);
      if (!league) {
        set({ loading: false, error: 'Most recent save was corrupted.' });
        return;
      }
      set({ league, loading: false });
    } catch (err) {
      console.error('[bs-hoops] continueLatest failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async saveActive() {
    const league = get().league;
    if (!league) return;
    try {
      await saveLeague(league);
    } catch (err) {
      console.error('[bs-hoops] saveActive failed:', err);
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearActive() {
    set({ league: null, error: null });
  },
}));
