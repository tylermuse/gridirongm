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
import { enterOffseason, startNextSeason, canAdvanceSeason } from '../season';
import {
  makeDraftPick,
  autoPickCurrent,
  autoPickUntilUser,
  revealLottery as revealLotteryState,
  getDraft,
  currentSlot,
} from '../draft';
import { resolveUserOffer, type Offer, type OfferResult } from '../freeAgency';
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

  /** Enter the offseason once a champion is crowned: age/retire players and
   *  set up the draft. Returns true on success (or if already in offseason). */
  enterOffseason: () => Promise<boolean>;

  /** Make the user team's current draft pick. */
  draftPick: (prospectId: string) => Promise<boolean>;

  /** Auto-make the pick currently on the clock (AI). */
  simDraftPick: () => Promise<boolean>;

  /** Auto-pick until the user team is on the clock or the draft ends. */
  simDraftToUser: () => Promise<boolean>;

  /** Auto-pick every remaining selection, including the user's. */
  simDraftAll: () => Promise<boolean>;

  /** Reveal the lottery order (cosmetic gate). */
  revealLottery: () => Promise<void>;

  /** Finalize the offseason and tip off the next season. Returns the new
   *  season number, or null if the draft isn't complete. */
  startNextSeason: () => Promise<number | null>;

  /** Make a free-agent offer for the user team. Optionally release a player to
   *  open a roster spot. Returns the resolution (signed / elsewhere / rejected). */
  signFreeAgent: (playerId: string, offer: Offer, releaseId?: string) => Promise<OfferResult | null>;
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

  async enterOffseason() {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return false;
    }
    if (getDraft(current)) return true; // already in the offseason/draft
    if (!canAdvanceSeason(current)) {
      set({ error: 'Finish the playoffs before entering the offseason.' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const league = enterOffseason(current);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] enterOffseason failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async draftPick(prospectId) {
    const current = get().league;
    if (!current) return false;
    const draft = getDraft(current);
    const slot = draft ? currentSlot(draft) : null;
    if (!slot) {
      set({ error: 'The draft is not in progress.' });
      return false;
    }
    if (slot.teamId !== current.userTeamId) {
      set({ error: 'It is not your pick.' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const league = makeDraftPick(current, prospectId as Parameters<typeof makeDraftPick>[1]);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] draftPick failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async simDraftPick() {
    const current = get().league;
    if (!current || !getDraft(current)) return false;
    set({ loading: true, error: null });
    try {
      const league = autoPickCurrent(current);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] simDraftPick failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async simDraftToUser() {
    const current = get().league;
    if (!current || !getDraft(current)) return false;
    set({ loading: true, error: null });
    try {
      const league = autoPickUntilUser(current, current.userTeamId);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] simDraftToUser failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async simDraftAll() {
    const current = get().league;
    if (!current || !getDraft(current)) return false;
    set({ loading: true, error: null });
    try {
      const league = autoPickUntilUser(current, null); // null → picks everyone
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] simDraftAll failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async revealLottery() {
    const current = get().league;
    if (!current || !getDraft(current)) return;
    try {
      const league = revealLotteryState(current);
      await saveLeague(league);
      set({ league });
    } catch (err) {
      console.error('[bs-hoops] revealLottery failed:', err);
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async startNextSeason() {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return null;
    }
    const draft = getDraft(current);
    if (!draft || !draft.complete) {
      set({ error: 'Finish the draft before starting the season.' });
      return null;
    }
    set({ loading: true, error: null });
    try {
      const league = startNextSeason(current);
      await saveLeague(league);
      set({ league, loading: false });
      return league.currentSeason;
    } catch (err) {
      console.error('[bs-hoops] startNextSeason failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async signFreeAgent(playerId, offer, releaseId) {
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
      const result = resolveUserOffer(
        current,
        playerId as Parameters<typeof resolveUserOffer>[1],
        offer,
        releaseId as Parameters<typeof resolveUserOffer>[3],
      );
      if (result.outcome !== 'rejected') {
        await saveLeague(result.league);
        set({ league: result.league, loading: false });
      } else {
        set({ loading: false });
      }
      return result;
    } catch (err) {
      console.error('[bs-hoops] signFreeAgent failed:', err);
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
