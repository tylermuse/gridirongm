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
  assembleLeague,
  type CreateBasketballLeagueOptions,
} from '../league/createLeague';
import {
  convertBbgmLeague,
  loadHoopsLeagueFromUrl,
  type ImportedHoopsLeague,
} from '../data/leagueImport';
import {
  saveLeague,
  loadLeague as loadLeagueFromDb,
  mostRecentLeague,
  type BasketballLeagueState,
} from '../persistence/db';
import { simNextGameForTeam } from '../sim/runNextGame';
import { simNextDay } from '../sim/runSimDay';
import { simThroughDay, TRADE_DEADLINE_DAY } from '../sim/simRange';
import {
  initializePlayoffs,
  simPlayoffDay,
  simPlayoffRound,
  simAllPlayoffs,
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
import { resolveUserOffer, negotiateOffer, releasePlayer as releasePlayerState, type Offer, type OfferResult, type Negotiation } from '../freeAgency';
import { applyRelease } from '../roster/release';
import { playThroughInjury as playThroughInjuryState } from '../injuries';
import { extensionMarket, extensionAccepted, buildExtension } from '../roster/extension';
import { executeTrade, proposeTrade as proposeTradeLib, type TradeSideInput, type ProposeResult } from '../trade';
import { setTeamLineup } from '../lineup';
import { clearGmFired } from '../approval';
import { setGodMode as setGodModeLib, editPlayer as editPlayerLib, type PlayerEdit } from '../godMode/godMode';
import { scoutProspect as scoutProspectState } from '../scouting';
import { markChangelogSeen as markChangelogSeenState } from '../ui/changelog';
import type { TeamId, BaseCoach } from '@bs/core/adapter';
import type { BasketballLineup, BasketballPlayer, BasketballTeam, BasketballGamePlan } from '@bs/sport-basketball';

interface LeagueStore {
  /** Currently loaded league, or null if user hasn't started one. */
  league: BasketballLeagueState | null;
  /** True while an async load/create is in flight. */
  loading: boolean;
  /** Last error message, or null. */
  error: string | null;
  /** Transient sim-result toast (new object each sim → re-triggers display). */
  simToast: { text: string } | null;
  /** Dismiss the sim toast. */
  dismissToast: () => void;
  /** Clear the current error message (dismisses the error banner). */
  clearError: () => void;

  /** Mark the current changelog version as seen (persisted on the league). */
  markChangelogSeen: () => Promise<void>;

  /** Create a fresh league and persist it. */
  newLeague: (opts?: CreateBasketballLeagueOptions) => Promise<void>;

  /** Import a BBGM/ZenGM roster file from a URL, build a league, and persist it.
   *  Returns true on success. The new league has no user team yet — call
   *  pickUserTeam next. */
  importLeagueFromUrl: (url: string) => Promise<boolean>;

  /** Import from already-parsed BBGM JSON (the file-upload path). */
  importLeagueFromData: (raw: unknown) => Promise<boolean>;

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

  /** God Mode (save-level): toggle, and edit a player's overall/age/potential. */
  setGodMode: (on: boolean) => Promise<void>;
  godEditPlayer: (playerId: string, patch: PlayerEdit) => Promise<void>;

  /** Sim the next scheduled game involving the user's team. Returns the
   *  played game's id on success, or null if there's no game to sim. */
  simNextUserGame: () => Promise<string | null>;

  /** Sim every scheduled game on the next day-of-season. Returns the day
   *  + number of games on success. */
  simDay: () => Promise<{ day: number; gamesSimmed: number } | null>;

  /** Advance day-by-day until the user team plays, then return that game (for
   *  the live viewer) plus the rest of the day's slate. No spoiler toast. */
  watchNextUserGame: () => Promise<{ userGameId: string; dayGameIds: string[]; day: number } | null>;

  /** Bulk-sim to a milestone: a week ahead, the trade deadline, or the end of
   *  the regular season. Returns days + games simmed. */
  simRange: (target: 'week' | 'deadline' | 'season') => Promise<{ daysSimmed: number; gamesSimmed: number } | null>;

  /** Seed + generate the playoff bracket once the regular season is done.
   *  Returns true if playoffs were started (or already running). */
  startPlayoffs: () => Promise<boolean>;

  /** Sim one playoff "day" — the next game of every active series. Returns
   *  the games simmed + champion id (set only when the Finals finish). */
  simPlayoffDay: () => Promise<{ gamesSimmed: number; champion: string | null } | null>;

  /** Sim until the current playoff round resolves. */
  simPlayoffRound: () => Promise<{ gamesSimmed: number; champion: string | null } | null>;

  /** Sim the rest of the postseason to a champion. */
  simAllPlayoffs: () => Promise<{ gamesSimmed: number; champion: string | null } | null>;

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

  /** Spend a scout to reveal a draft prospect's true potential. */
  scoutProspect: (prospectId: string) => Promise<void>;

  /** Finalize the offseason and tip off the next season. Returns the new
   *  season number, or null if the draft isn't complete. */
  startNextSeason: () => Promise<number | null>;

  /** Make a free-agent offer for the user team. Optionally release a player to
   *  open a roster spot. Returns the resolution (signed / elsewhere / rejected). */
  signFreeAgent: (playerId: string, offer: Offer, releaseId?: string) => Promise<OfferResult | null>;

  /** Negotiate a free-agent offer: signs if it clears the bar, otherwise
   *  returns the agent's counter (no state change). */
  negotiateFreeAgent: (playerId: string, offer: Offer, releaseId?: string) => Promise<Negotiation | null>;

  /** Execute a (pre-validated) two-team trade. Returns true on success. */
  executeTrade: (sides: TradeSideInput[]) => Promise<boolean>;
  proposeTrade: (sides: TradeSideInput[]) => Promise<ProposeResult | null>;

  /** Persist a team's lineup (the sim uses it when valid). Returns true on success. */
  saveLineup: (teamId: string, lineup: BasketballLineup) => Promise<boolean>;

  /** Persist a team's pre-game plan (the sim biases the box score by it). */
  saveGamePlan: (teamId: string, plan: BasketballGamePlan) => Promise<boolean>;

  /** Hire a head coach for a team (the outgoing coach leaves). */
  hireCoach: (teamId: string, coach: BaseCoach) => Promise<boolean>;

  /** Waive a rostered player to free agency (opens a roster spot). */
  releasePlayer: (playerId: string, stretch?: boolean) => Promise<boolean>;
  playThroughInjury: (playerId: string) => Promise<boolean>;

  /** Negotiate a contract extension. The player accepts a fair offer (a touch
   *  under market, for loyalty) and the years append to the end of the deal. */
  extendPlayer: (playerId: string, offer: Offer) => Promise<{ accepted: boolean; message: string } | null>;
}

/** One-line summary for the sim toast: games simmed + the user team's most
 *  recent result. */
function simSummary(league: BasketballLeagueState, gamesSimmed: number): string {
  const base = `${gamesSimmed} game${gamesSimmed === 1 ? '' : 's'} simmed`;
  const uid = league.userTeamId;
  if (!uid) return base;
  let latest: (typeof league.games)[number] | null = null;
  let latestDay = -1;
  for (const g of league.games) {
    if (g.status !== 'played' || !g.finalScore) continue;
    if (g.homeTeamId !== uid && g.awayTeamId !== uid) continue;
    const d = (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
    if (d > latestDay) { latestDay = d; latest = g; }
  }
  if (!latest || !latest.finalScore) return base;
  const isHome = latest.homeTeamId === uid;
  const us = isHome ? latest.finalScore.home : latest.finalScore.away;
  const them = isHome ? latest.finalScore.away : latest.finalScore.home;
  const oppId = isHome ? latest.awayTeamId : latest.homeTeamId;
  const opp = league.teams.find(t => t.id === oppId);
  return `${base} · You ${us > them ? 'won' : 'lost'} ${us}–${them} ${isHome ? 'vs' : '@'} ${opp?.abbreviation ?? ''}`.trim();
}

/** Build a persistable league from converted import data. */
function leagueFromImport(imported: ImportedHoopsLeague): BasketballLeagueState {
  return assembleLeague({
    teams: imported.teams,
    players: imported.players,
    freeAgentIds: imported.freeAgentIds,
    season: imported.season,
    displayName: `NBA ${imported.season}`,
  });
}

/** Friendly error copy for a failed import. */
function importErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `Couldn't import that roster file. ${msg}`;
}

/** Yield a frame so the browser can paint the loading state before a heavy,
 *  synchronous sim blocks the main thread — keeps clicking Sim responsive (INP).
 *  No-op-safe on the server. */
function yieldToPaint(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') { resolve(); return; }
    window.setTimeout(resolve, 0);
  });
}

export const useLeagueStore = create<LeagueStore>((set, get) => ({
  league: null,
  loading: false,
  error: null,
  simToast: null,
  dismissToast() { set({ simToast: null }); },
  clearError() { set({ error: null }); },

  async markChangelogSeen() {
    const current = get().league;
    if (!current) return;
    const league = markChangelogSeenState(current);
    set({ league });
    try { await saveLeague(league); } catch (err) { console.error('[bs-hoops] markChangelogSeen failed:', err); }
  },

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

  async importLeagueFromUrl(url) {
    set({ loading: true, error: null });
    try {
      const imported = await loadHoopsLeagueFromUrl(url);
      const league = leagueFromImport(imported);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] importLeagueFromUrl failed:', err);
      set({ loading: false, error: importErrorMessage(err) });
      return false;
    }
  },

  async importLeagueFromData(raw) {
    set({ loading: true, error: null });
    try {
      const imported = convertBbgmLeague(raw as Parameters<typeof convertBbgmLeague>[0]);
      const league = leagueFromImport(imported);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] importLeagueFromData failed:', err);
      set({ loading: false, error: importErrorMessage(err) });
      return false;
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
    // Taking over a team clears any prior "fired" state.
    const updated = clearGmFired({ ...current, userTeamId: teamId });
    set({ league: updated });
    try {
      await saveLeague(updated);
    } catch (err) {
      console.error('[bs-hoops] pickUserTeam save failed:', err);
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async setGodMode(on) {
    const current = get().league;
    if (!current) return;
    const league = setGodModeLib(current, on);
    set({ league });
    try { await saveLeague(league); } catch (err) { console.error('[bs-hoops] setGodMode failed:', err); }
  },

  async godEditPlayer(playerId, patch) {
    const current = get().league;
    if (!current) return;
    const league = editPlayerLib(current, playerId, patch);
    set({ league });
    try { await saveLeague(league); } catch (err) { console.error('[bs-hoops] godEditPlayer failed:', err); }
  },

  async simDay() {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return null;
    }
    set({ loading: true, error: null });
    try {
      await yieldToPaint();
      const outcome = simNextDay(current);
      if (!outcome) {
        set({ loading: false, error: 'No more scheduled games to sim.' });
        return null;
      }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false, simToast: { text: simSummary(outcome.league, outcome.gamesSimmed) } });
      return { day: outcome.day, gamesSimmed: outcome.gamesSimmed };
    } catch (err) {
      console.error('[bs-hoops] simDay failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async watchNextUserGame() {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return null; }
    const uid = current.userTeamId;
    if (!uid) { set({ error: 'Pick a team first.' }); return null; }
    set({ loading: true, error: null });
    await yieldToPaint();
    try {
      let league = current;
      let result: { userGameId: string; dayGameIds: string[]; day: number } | null = null;
      for (let guard = 0; guard < 200; guard++) {
        const outcome = simNextDay(league);
        if (!outcome) break;
        league = outcome.league;
        const day = outcome.day;
        const dayGames = league.games.filter(
          g => g.status === 'played' && (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason === day,
        );
        const userGame = dayGames.find(g => g.homeTeamId === uid || g.awayTeamId === uid);
        if (userGame) {
          result = { userGameId: userGame.id, dayGameIds: dayGames.map(g => g.id), day };
          break;
        }
      }
      if (!result) { set({ loading: false, error: 'No upcoming game to watch.' }); return null; }
      await saveLeague(league);
      // Deliberately no sim toast — it would spoil the score before the watch.
      set({ league, loading: false });
      return result;
    } catch (err) {
      console.error('[bs-hoops] watchNextUserGame failed:', err);
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
      await yieldToPaint();
      const outcome = simPlayoffDay(current);
      if (!outcome) {
        set({ loading: false, error: 'No playoff games left to sim.' });
        return null;
      }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false, simToast: { text: simSummary(outcome.league, outcome.gamesSimmed) } });
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

  async scoutProspect(prospectId) {
    const current = get().league;
    if (!current || !getDraft(current)) return;
    try {
      const league = scoutProspectState(current, prospectId);
      await saveLeague(league);
      set({ league });
    } catch (err) {
      console.error('[bs-hoops] scoutProspect failed:', err);
      set({ error: err instanceof Error ? err.message : String(err) });
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

  async negotiateFreeAgent(playerId, offer, releaseId) {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return null; }
    if (!current.userTeamId) { set({ error: 'Pick a team first.' }); return null; }
    set({ loading: true, error: null });
    try {
      const neg = negotiateOffer(
        current,
        playerId as Parameters<typeof negotiateOffer>[1],
        offer,
        releaseId as Parameters<typeof negotiateOffer>[3],
      );
      if (neg.kind === 'resolved' && neg.result.outcome !== 'rejected') {
        await saveLeague(neg.result.league);
        set({ league: neg.result.league, loading: false });
      } else {
        set({ loading: false });
      }
      return neg;
    } catch (err) {
      console.error('[bs-hoops] negotiateFreeAgent failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async executeTrade(sides) {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const league = executeTrade(current, sides);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] executeTrade failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async proposeTrade(sides) {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return null;
    }
    set({ loading: true, error: null });
    try {
      const result = proposeTradeLib(current, sides);
      await saveLeague(result.league);
      set({ league: result.league, loading: false });
      return result;
    } catch (err) {
      console.error('[bs-hoops] proposeTrade failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async saveLineup(teamId, lineup) {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const league = setTeamLineup(current, teamId as TeamId, lineup);
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] saveLineup failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async hireCoach(teamId, coach) {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return false; }
    set({ loading: true, error: null });
    try {
      const team = current.teams.find(t => t.id === teamId);
      const coaches = { ...current.coaches } as Record<string, BaseCoach>;
      if (team) for (const id of team.coachIds) delete coaches[id]; // outgoing coach leaves
      const hired: BaseCoach = { ...coach, teamId: teamId as TeamId, role: 'HC' };
      coaches[hired.id] = hired;
      const teams = current.teams.map(t => (t.id === teamId ? ({ ...t, coachIds: [hired.id] } as typeof t) : t));
      const league = { ...current, coaches, teams };
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] hireCoach failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async saveGamePlan(teamId, plan) {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return false; }
    set({ loading: true, error: null });
    try {
      const teams = current.teams.map(t =>
        t.id === teamId
          ? ({ ...t, sportData: { ...(t as BasketballTeam).sportData, gamePlan: plan } } as typeof t)
          : t,
      );
      const league = { ...current, teams };
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] saveGamePlan failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async releasePlayer(playerId, stretch = false) {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return false; }
    set({ loading: true, error: null });
    try {
      const league = applyRelease(current, playerId, stretch) as typeof current;
      await saveLeague(league);
      set({ league, loading: false });
      return true;
    } catch (err) {
      console.error('[bs-hoops] releasePlayer failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async playThroughInjury(playerId) {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return false; }
    try {
      const league = playThroughInjuryState(current, playerId, current.currentTick) as typeof current;
      await saveLeague(league);
      set({ league });
      return true;
    } catch (err) {
      console.error('[bs-hoops] playThroughInjury failed:', err);
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  async extendPlayer(playerId, offer) {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return null; }
    const player = current.players[playerId as Parameters<typeof releasePlayerState>[1]] as BasketballPlayer | undefined;
    if (!player) { set({ error: 'Player not found.' }); return null; }

    const market = extensionMarket(player, current.currentSeason);
    if (!extensionAccepted(market, offer)) {
      const ask = `$${(market.marketSalary / 1e6).toFixed(1)}M/yr over ${market.desiredYears}y`;
      return { accepted: false, message: `${player.firstName} ${player.lastName} turned it down — he's looking for closer to ${ask}.` };
    }

    set({ loading: true, error: null });
    try {
      const contract = buildExtension(player, offer, market);
      const players = { ...current.players, [playerId]: { ...player, contract } };
      const league = { ...current, players };
      await saveLeague(league);
      set({ league, loading: false });
      return { accepted: true, message: `${player.firstName} ${player.lastName} signed a ${offer.years}-year, $${(offer.salaryPerYear / 1e6).toFixed(1)}M/yr extension.` };
    } catch (err) {
      console.error('[bs-hoops] extendPlayer failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async simPlayoffRound() {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return null; }
    set({ loading: true, error: null });
    try {
      await yieldToPaint();
      const outcome = simPlayoffRound(current);
      if (!outcome) { set({ loading: false, error: 'No playoff games left to sim.' }); return null; }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false, simToast: { text: simSummary(outcome.league, outcome.gamesSimmed) } });
      return { gamesSimmed: outcome.gamesSimmed, champion: outcome.champion };
    } catch (err) {
      console.error('[bs-hoops] simPlayoffRound failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async simAllPlayoffs() {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return null; }
    set({ loading: true, error: null });
    try {
      await yieldToPaint();
      const outcome = simAllPlayoffs(current);
      if (!outcome) { set({ loading: false, error: 'No playoff games left to sim.' }); return null; }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false, simToast: { text: simSummary(outcome.league, outcome.gamesSimmed) } });
      return { gamesSimmed: outcome.gamesSimmed, champion: outcome.champion };
    } catch (err) {
      console.error('[bs-hoops] simAllPlayoffs failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async simRange(target) {
    const current = get().league;
    if (!current) {
      set({ error: 'No league loaded.' });
      return null;
    }
    const targetDay =
      target === 'week' ? current.currentTick + 7 :
      target === 'deadline' ? TRADE_DEADLINE_DAY :
      null;
    set({ loading: true, error: null });
    try {
      await yieldToPaint();
      const outcome = simThroughDay(current, targetDay);
      if (outcome.gamesSimmed === 0) {
        set({ loading: false, error: 'No games left to sim in that range.' });
        return null;
      }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false, simToast: { text: simSummary(outcome.league, outcome.gamesSimmed) } });
      return { daysSimmed: outcome.daysSimmed, gamesSimmed: outcome.gamesSimmed };
    } catch (err) {
      console.error('[bs-hoops] simRange failed:', err);
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
      await yieldToPaint();
      const outcome = simNextGameForTeam(current, current.userTeamId);
      if (!outcome) {
        set({ loading: false, error: 'No more scheduled games for this team.' });
        return null;
      }
      await saveLeague(outcome.league);
      set({ league: outcome.league, loading: false, simToast: { text: simSummary(outcome.league, 1) } });
      return outcome.gameId;
    } catch (err) {
      console.error('[bs-hoops] simNextUserGame failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },
}));
