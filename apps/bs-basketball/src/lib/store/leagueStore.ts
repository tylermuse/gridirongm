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
import { ESPN_2026_R1_ORDER, normalizeAbbrev } from '../data/draft2026';
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
  SCOUTS_PER_DRAFT,
  type DraftState,
  type DraftPickSlot,
} from '../draft';
import { pickKey, currentOwner } from '../trade/picks';
import { basketballPickTradeValue, basketballTradeValue } from '@bs/sport-basketball';
import { resolveUserOffer, negotiateOffer, releasePlayer as releasePlayerState, runAiFreeAgency, FA_DAYS, type Offer, type OfferResult, type Negotiation } from '../freeAgency';
import { applyRelease } from '../roster/release';
import { playThroughInjury as playThroughInjuryState } from '../injuries';
import { extensionMarket, extensionAccepted, buildExtension } from '../roster/extension';
import { executeTrade, proposeTrade as proposeTradeLib, type TradeSideInput, type ProposeResult } from '../trade';
import { setTeamLineup } from '../lineup';
import { clearGmFired } from '../approval';
import { setGodMode as setGodModeLib, editPlayer as editPlayerLib, type PlayerEdit } from '../godMode/godMode';
import { forceUserGameResult } from '../godMode/forceGame';
import { relocateTeam as relocateTeamLib, type FranchiseEdit } from '../godMode/relocate';
import { buildGmSyncPayload, syncGmStats, computeUserDraftGrade } from '../gm/gmSync';
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
  /** God Mode: force the user's next scheduled game to a win/loss. */
  forceUserGame: (win: boolean) => Promise<boolean>;
  /** God Mode: relocate / rebrand a franchise (city, name, abbrev, colors). */
  relocateTeam: (teamId: string, edit: FranchiseEdit) => Promise<void>;

  /** Finish an imported league's inaugural draft → tip into the current
   *  season's preseason (no year roll); undrafted prospects become free agents. */
  finishInauguralDraft: () => Promise<void>;

  /** Sim the next scheduled game involving the user's team. Returns the
   *  played game's id on success, or null if there's no game to sim. */
  simNextUserGame: () => Promise<string | null>;

  /** Sim every scheduled game on the next day-of-season. Returns the day
   *  + number of games on success. */
  simDay: () => Promise<{ day: number; gamesSimmed: number } | null>;

  /** Advance day-by-day until the user team plays, then return that game (for
   *  the live viewer) plus the rest of the day's slate. No spoiler toast. */
  watchNextUserGame: () => Promise<{ userGameId: string; dayGameIds: string[]; day: number } | null>;
  /** Sim playoff days until the user's team plays, then return that game to watch. */
  watchNextPlayoffGame: () => Promise<{ userGameId: string; dayGameIds: string[]; day: number } | null>;

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
  /** Trade picks (and players) within the current draft (updates the live order). */
  tradeDraftPicks: (partnerId: string, sendOveralls: number[], getOveralls: number[], sendPlayerIds?: string[], getPlayerIds?: string[]) => Promise<{ accepted: boolean; reason: string }>;

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
  /** Run CPU free agency (other teams sign/upgrade); rounds controls how far. Returns count. */
  simFreeAgency: (rounds?: number) => Promise<number>;
  /** Advance the FA day clock by `days` (price decay applies) + run CPU FA. */
  advanceFreeAgency: (days: number) => Promise<number>;

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
  let league = assembleLeague({
    teams: imported.teams,
    players: imported.players,
    freeAgentIds: imported.freeAgentIds,
    season: imported.season,
    displayName: `BS Hoops ${imported.season}`,
  });

  // Real traded-pick ownership from the file → the pick-ownership registry, so
  // the inaugural draft conveys traded picks correctly.
  const pickOwnership: Record<string, TeamId> = {};
  for (const o of imported.draftPickOwnership) {
    pickOwnership[pickKey(imported.season, o.round, o.originalTeamId)] = o.ownerTeamId;
  }
  // Flag custom-roster leagues so they're excluded from the global GM board.
  league = { ...league, sportData: { ...(league.sportData as object), imported: true, pickOwnership } };

  // Imported leagues start with their upcoming draft before free agency — the
  // file is a pre-draft snapshot, so don't skip it. Round 1 uses the real ESPN
  // 2026 order (team that makes each pick, traded picks baked in); round 2 falls
  // back to the most recent completed season's reverse standings.
  if (imported.draftProspectIds.length > 0) {
    const reverseStandings = imported.draftOrderTeamIds.length === league.teams.length
      ? imported.draftOrderTeamIds
      : (league.teams as BasketballTeam[]).map(t => t.id as string);
    const idByAbbrev = new Map<string, string>();
    for (const t of league.teams as BasketballTeam[]) idByAbbrev.set(normalizeAbbrev(t.abbreviation), t.id as string);
    const espnR1 = ESPN_2026_R1_ORDER.map(a => idByAbbrev.get(normalizeAbbrev(a))).filter((id): id is string => !!id);
    const round1 = espnR1.length === league.teams.length ? espnR1 : reverseStandings;

    const picks: DraftPickSlot[] = [];
    for (let round = 1; round <= 2; round++) {
      const order = round === 1 ? round1 : reverseStandings;
      order.forEach((teamId, i) => {
        const overall = (round - 1) * order.length + i + 1;
        // R1 owner comes straight from ESPN (trades baked in) — no registry
        // re-resolution (getDraft skips inaugural drafts); R2 conveys via the
        // file's pick ownership.
        picks.push({
          overall,
          round,
          pickInRound: i + 1,
          originalTeamId: teamId as TeamId,
          teamId: round === 1 ? (teamId as TeamId) : currentOwner(league, imported.season, round, teamId as TeamId),
          isLottery: overall <= 14,
          prospectId: null,
        });
      });
    }
    const draft: DraftState = {
      season: imported.season,
      picks,
      poolIds: [...imported.draftProspectIds],
      currentPick: 0,
      complete: false,
      lotteryRevealed: true,
      scoutsRemaining: SCOUTS_PER_DRAFT,
      scoutedIds: [],
      inaugural: true,
    };
    league = { ...league, sportData: { ...(league.sportData as object), draft }, currentPhase: 'offseason' };
  }
  return league;
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

  async forceUserGame(win) {
    const current = get().league;
    if (!current) return false;
    const league = forceUserGameResult(current, win);
    if (!league) { set({ error: 'No upcoming game to force (God Mode off, spectating, or season over).' }); return false; }
    set({ league, simToast: { text: win ? 'God Mode: forced a win 🛠️' : 'God Mode: forced a loss 🛠️' } });
    try { await saveLeague(league); } catch (err) { console.error('[bs-hoops] forceUserGame failed:', err); }
    return true;
  },

  async relocateTeam(teamId, edit) {
    const current = get().league;
    if (!current) return;
    const league = relocateTeamLib(current, teamId, edit);
    set({ league });
    try { await saveLeague(league); } catch (err) { console.error('[bs-hoops] relocateTeam failed:', err); }
  },

  async finishInauguralDraft() {
    const current = get().league;
    if (!current) return;
    const draft = getDraft(current);
    // Undrafted prospects fall to free agency.
    const undrafted = (draft?.poolIds ?? []).filter(id => {
      const p = current.players[id] as BasketballPlayer | undefined;
      return p && !p.rosterSlot;
    });
    const sd = { ...(current.sportData as Record<string, unknown>) };
    delete sd.draft;
    const league = {
      ...current,
      sportData: sd,
      currentPhase: 'preseason' as const,
      freeAgentIds: [...current.freeAgentIds, ...undrafted],
    } as BasketballLeagueState;
    set({ league });
    try { await saveLeague(league); } catch (err) { console.error('[bs-hoops] finishInauguralDraft failed:', err); }
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

  async watchNextPlayoffGame() {
    const current = get().league;
    if (!current) { set({ error: 'No league loaded.' }); return null; }
    const uid = current.userTeamId;
    if (!uid) { set({ error: 'Pick a team first.' }); return null; }
    set({ loading: true, error: null });
    await yieldToPaint();
    try {
      let league = current;
      let result: { userGameId: string; dayGameIds: string[]; day: number } | null = null;
      for (let guard = 0; guard < 60; guard++) {
        const before = new Set(league.games.filter(g => g.status === 'played').map(g => g.id));
        const outcome = simPlayoffDay(league);
        if (!outcome) break;
        league = outcome.league;
        // Games newly played this day (avoids depending on day-index math).
        const dayGames = league.games.filter(g => g.status === 'played' && !before.has(g.id));
        const userGame = dayGames.find(g => g.homeTeamId === uid || g.awayTeamId === uid);
        if (userGame) {
          result = { userGameId: userGame.id, dayGameIds: dayGames.map(g => g.id), day: outcome.day };
          break;
        }
      }
      if (!result) { set({ loading: false, error: "Your team has no upcoming playoff game (eliminated or out)." }); return null; }
      await saveLeague(league);
      // No sim toast — it would spoil the score before the watch.
      set({ league, loading: false });
      return result;
    } catch (err) {
      console.error('[bs-hoops] watchNextPlayoffGame failed:', err);
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
      // Sync the just-completed season to the global GM board before rollover
      // (current still holds the final bracket + records). Fire-and-forget.
      const payload = buildGmSyncPayload(current);
      if (payload) syncGmStats(payload);

      const league = enterOffseason(current);
      await saveLeague(league);
      // Immediate heads-up if ownership just fired the GM (userTeamId cleared).
      const justFired = !!current.userTeamId && !league.userTeamId;
      const fired = (league.sportData as { gmFired?: { teamName: string } }).gmFired;
      set({
        league,
        loading: false,
        simToast: justFired && fired ? { text: `📉 You've been fired by the ${fired.teamName}. Pick a new GM job from Home.` } : undefined,
      });
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

  async tradeDraftPicks(partnerId, sendOveralls, getOveralls, sendPlayerIds = [], getPlayerIds = []) {
    const current = get().league;
    const draft = current ? getDraft(current) : null;
    if (!current || !draft) return { accepted: false, reason: 'No draft in progress.' };
    const userTeamId = current.userTeamId;
    if (!userTeamId) return { accepted: false, reason: 'You are spectating.' };
    if (sendOveralls.length + getOveralls.length + sendPlayerIds.length + getPlayerIds.length === 0) {
      return { accepted: false, reason: 'Add assets to both sides.' };
    }

    // Value everything on the same PTS scale as the main trade center (picks by
    // their exact slot, players by trade value), so picks + players mix fairly.
    const srcPlayers = current.players as Record<string, BasketballPlayer>;
    const pickVal = (os: number[]) => os.reduce((s, o) => s + basketballPickTradeValue(o), 0);
    const playerVal = (ids: string[]) => ids.reduce((s, id) => s + (srcPlayers[id] ? basketballTradeValue(srcPlayers[id], { season: current.currentSeason }) : 0), 0);
    const sendVal = pickVal(sendOveralls) + playerVal(sendPlayerIds);
    const getVal = pickVal(getOveralls) + playerVal(getPlayerIds);
    // Teams trading down value accumulating picks, so each extra pick you send
    // widens their tolerance — a normal package-to-move-up goes through.
    const quantityBonus = Math.max(0, sendOveralls.length - getOveralls.length) * 250;
    if (sendVal + quantityBonus < getVal * 0.9) {
      return { accepted: false, reason: 'They want more value — add a pick or player.' };
    }

    set({ loading: true, error: null });
    try {
      // 1) Move players (mirrors executeTrade's roster re-slotting).
      const moveTo = new Map<string, TeamId>();
      for (const id of sendPlayerIds) moveTo.set(id, partnerId as TeamId);
      for (const id of getPlayerIds) moveTo.set(id, userTeamId);
      const arriving: Record<string, string[]> = {};
      for (const [pid, to] of moveTo) (arriving[to] ??= []).push(pid);
      const players = { ...current.players } as Record<string, BasketballPlayer>;
      const teams = current.teams.map(t => {
        const incoming = arriving[t.id as string] ?? [];
        const keep = (ids: string[]) => ids.filter(id => !moveTo.has(id));
        const playerIds = [...keep(t.playerIds as unknown as string[]), ...incoming];
        const rosterBuckets: Record<string, string[]> = {};
        for (const [name, ids] of Object.entries(t.rosterBuckets)) {
          rosterBuckets[name] = name === 'active' ? [...keep(ids as unknown as string[]), ...incoming] : keep(ids as unknown as string[]);
        }
        return { ...t, playerIds, rosterBuckets };
      }) as typeof current.teams;
      for (const team of teams) {
        (team.playerIds as unknown as string[]).forEach((pid, index) => {
          if (moveTo.has(pid)) {
            const prev = players[pid];
            players[pid] = { ...prev, rosterSlot: { teamId: team.id, bucket: 'active', index }, sportData: { ...prev.sportData, acquiredVia: 'trade', acquiredSeason: current.currentSeason } };
          }
        });
      }

      // 2) Reassign each traded pick's slot directly (handles the imported draft
      //    where a team can hold multiple firsts) + mirror into the registry so a
      //    normal draft's re-resolution agrees.
      const send = new Set(sendOveralls);
      const recv = new Set(getOveralls);
      const sd = current.sportData as { pickOwnership?: Record<string, TeamId> };
      const pickOwnership = { ...(sd.pickOwnership ?? {}) };
      const picks = draft.picks.map(p => {
        if (send.has(p.overall)) { pickOwnership[pickKey(draft.season, p.round, p.originalTeamId)] = partnerId as TeamId; return { ...p, teamId: partnerId as TeamId }; }
        if (recv.has(p.overall)) { pickOwnership[pickKey(draft.season, p.round, p.originalTeamId)] = userTeamId; return { ...p, teamId: userTeamId }; }
        return p;
      });

      const league = { ...current, teams, players, sportData: { ...(current.sportData as object), draft: { ...draft, picks }, pickOwnership } };
      await saveLeague(league);
      set({ league, loading: false });
      return { accepted: true, reason: 'Trade accepted! Assets swapped.' };
    } catch (err) {
      console.error('[bs-hoops] tradeDraftPicks failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return { accepted: false, reason: 'Trade failed to save.' };
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
      // Stamp the user's draft grade (the draft is complete here) keyed to the
      // season the rookies enter, so the GM board's Best Draft award can rank it.
      const grade = computeUserDraftGrade(current);
      let league = startNextSeason(current);
      if (grade) {
        const sd = league.sportData as { draftGradeBySeason?: Record<number, { score: number; grade: string }> };
        league = { ...league, sportData: { ...sd, draftGradeBySeason: { ...(sd?.draftGradeBySeason ?? {}), [grade.season]: { score: grade.score, grade: grade.grade } } } };
      }
      await saveLeague(league);
      set({ league, loading: false });
      return league.currentSeason;
    } catch (err) {
      console.error('[bs-hoops] startNextSeason failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async simFreeAgency(rounds?: number) {
    const current = get().league;
    if (!current) return 0;
    set({ loading: true, error: null });
    try {
      const { league, signings } = runAiFreeAgency(current, rounds !== undefined ? { rounds } : undefined);
      await saveLeague(league);
      set({
        league,
        loading: false,
        simToast: { text: signings.length ? `🖊️ ${signings.length} free-agent signing${signings.length === 1 ? '' : 's'} across the league` : 'No free-agent moves this round' },
      });
      return signings.length;
    } catch (err) {
      console.error('[bs-hoops] simFreeAgency failed:', err);
      set({ loading: false });
      return 0;
    }
  },

  async advanceFreeAgency(days) {
    const current = get().league;
    if (!current) return 0;
    set({ loading: true, error: null });
    try {
      const sd = current.sportData as { faDay?: number };
      const newDay = Math.min(FA_DAYS, (sd.faDay ?? 0) + days);
      // Bump the day first so the price decay applies to this round's signings.
      const withDay = { ...current, sportData: { ...(current.sportData as object), faDay: newDay } };
      const { league, signings } = runAiFreeAgency(withDay, { rounds: Math.max(1, days) });
      await saveLeague(league);
      set({
        league,
        loading: false,
        simToast: { text: `Day ${newDay} of ${FA_DAYS} · ${signings.length} signing${signings.length === 1 ? '' : 's'} league-wide` },
      });
      return signings.length;
    } catch (err) {
      console.error('[bs-hoops] advanceFreeAgency failed:', err);
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return 0;
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
      const message = `${player.firstName} ${player.lastName} signed a ${offer.years}-year, $${(offer.salaryPerYear / 1e6).toFixed(1)}M/yr extension.`;
      set({ league, loading: false, simToast: { text: `✅ ${message}` } });
      return { accepted: true, message };
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
