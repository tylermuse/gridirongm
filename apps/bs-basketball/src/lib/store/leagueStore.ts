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
import { simNextGameForTeam } from '../sim/runNextGame';
import { simNextDay } from '../sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  isRegularSeasonComplete,
  getBracket,
} from '../playoffs';
import type { TeamId } from '@bs/core/adapter';

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

  /** Set which team the user is GMing. Persisted via Dexie. */
  pickUserTeam: (teamId: TeamId) => Promise<void>;

  /** Sim the next scheduled game involving the user's team. Returns the
   *  played game's id on success, or null if there's no game to sim. */
  simNextUserGame: () => Promise<string | null>;

  /** Sim every scheduled game on the next day-of-season. Returns the day
   *  + number of games on success. */
  simDay: () => Promise<{ day: number; gamesSimmed: number } | null>;

  /** Seed + generate the playoff bracket once the regular season is done.
   *  Returns true if playoffs were started (or already running). */
  startPlayoffs: () => Promise<boolean>;

  /** Sim one playoff "day" — the next game of every active series. Returns
   *  the games simmed + champion id (set only when the Finals finish). */
  simPlayoffDay: () => Promise<{ gamesSimmed: number; champion: string | null } | null>;
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

  async pickUserTeam(teamId) {
    const current = get().league;
    if (!current) return;
    const updated = { ...current, userTeamId: teamId };
    set({ league: updated });
    try {
      await saveLeague(updated);
    } catch (err) {
      console.error('[bs-hoops] pickUserTeam save failed:', err);
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async simDay() {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return null;
    }
    set({ loading: true, error: null });
    try {
      const outcome = simNextDay(current);
      if (!outcome) {
        set({ loading: false, error: 'No more scheduled games to sim.' });
        return null;
      }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false });
      return { day: outcome.day, gamesSimmed: outcome.gamesSimmed };
    } catch (err) {
      console.error('[bs-hoops] simDay failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async startPlayoffs() {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return false;
    }
    if (getBracket(current)) return true; // already started
    if (!isRegularSeasonComplete(current)) {
      set({ error: 'Finish the regular season before starting the playoffs.' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const league = initializePlayoffs(current);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] startPlayoffs failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async simPlayoffDay() {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return null;
    }
    set({ loading: true, error: null });
    try {
      const outcome = simPlayoffDay(current);
      if (!outcome) {
        set({ loading: false, error: 'No playoff games left to sim.' });
        return null;
      }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false });
      return { gamesSimmed: outcome.gamesSimmed, champion: outcome.champion };
    } catch (err) {
      console.error('[bs-hoops] simPlayoffDay failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async simNextUserGame() {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return null;
    }
    if (!current.userTeamId) {
      set({ error: 'Pick a team first.' });
      return null;
    }
    set({ loading: true, error: null });
    try {
      const outcome = simNextGameForTeam(current, current.userTeamId);
      if (!outcome) {
        set({ loading: false, error: 'No more scheduled games for this team.' });
        return null;
      }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false });
      return outcome.gameId;
    } catch (err) {
      console.error('[bs-hoops] simNextUserGame failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },
}));
