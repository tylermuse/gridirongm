/**
 * Draft logic (Phase 2D-4).
 *
 * Pure functions over league state: build the order (lottery + reverse
 * standings) from the finished season, recommend/make picks, and assign drafted
 * rookies to rosters with rookie-scale contracts. The interactive board and the
 * AI auto-pick both flow through `makeDraftPick`, so a hand pick and a simmed
 * pick are identical apart from who chose the prospect.
 *
 * This replaces 2D-3's auto-backfill: the rollover now generates the class and
 * hands it to the draft instead of distributing it directly.
 */

import {
  generateBasketballDraftOrder,
  aiBasketballDraftPick,
  rookieScaleContract,
  basketballSalaryCap,
  type BasketballPlayer,
  type StandingsEntry,
} from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';
import type { DraftPickSlot, DraftState } from './types';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

interface LeagueSportData {
  draft?: DraftState;
  [key: string]: unknown;
}

export function getDraft(league: LeagueState): DraftState | null {
  return (league.sportData as LeagueSportData | undefined)?.draft ?? null;
}

/** The pick currently on the clock, or null if the draft is done. */
export function currentSlot(draft: DraftState): DraftPickSlot | null {
  if (draft.complete || draft.currentPick >= draft.picks.length) return null;
  return draft.picks[draft.currentPick];
}

/**
 * Build the draft order from the just-finished season: non-playoff teams enter
 * the weighted lottery (picks 1-14), the rest fall by reverse standings, then a
 * full reverse-standings round 2. `poolIds` are the prospects to be drafted.
 */
export function setupDraft(league: LeagueState, season: number, poolIds: PlayerId[]): DraftState {
  const bracket = getBracket(league);
  const playoffTeams = new Set<TeamId>();
  if (bracket) {
    for (const id of [...bracket.seeds.Eastern, ...bracket.seeds.Western]) playoffTeams.add(id);
  }

  const standings: StandingsEntry[] = league.teams.map(t => ({
    teamId: t.id,
    wins: t.record.wins,
    losses: t.record.losses,
    madePlayoffs: playoffTeams.has(t.id),
  }));

  const order = generateBasketballDraftOrder(standings, { rngSeed: `draft-${season}` });
  const picks: DraftPickSlot[] = order.map((teamId, i) => ({
    overall: i + 1,
    round: i < 30 ? 1 : 2,
    pickInRound: (i % 30) + 1,
    teamId,
    isLottery: i < 14,
    prospectId: null,
  }));

  return {
    season,
    picks,
    poolIds: [...poolIds],
    currentPick: 0,
    complete: false,
    lotteryRevealed: false,
  };
}

/** Prospect the AI would take for whoever is on the clock (also used to flag a
 *  recommendation for the user). Null if the draft is done / pool empty. */
export function recommendedProspectId(league: LeagueState, draft: DraftState): PlayerId | null {
  const slot = currentSlot(draft);
  if (!slot || draft.poolIds.length === 0) return null;
  const team = league.teams.find(t => t.id === slot.teamId);
  const roster = (team?.playerIds ?? [])
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
  const pool = draft.poolIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
  if (pool.length === 0) return null;
  return aiBasketballDraftPick({ teamId: slot.teamId, rosterPlayers: roster }, pool);
}

/**
 * Assign `prospectId` to the team on the clock, sign a rookie-scale contract
 * (round 1) or minimum (round 2), advance the clock. Returns a new league.
 */
export function makeDraftPick(league: LeagueState, prospectId: PlayerId): LeagueState {
  const draft = getDraft(league);
  if (!draft) throw new Error('No draft in progress.');
  const slot = currentSlot(draft);
  if (!slot) throw new Error('Draft is already complete.');
  if (!draft.poolIds.includes(prospectId)) throw new Error('Prospect is not in the draft pool.');

  const team = league.teams.find(t => t.id === slot.teamId);
  if (!team) throw new Error('Picking team not found.');

  const contract = rookieScaleContract(slot.overall, {
    signedSeason: draft.season,
    capForSeason: basketballSalaryCap(draft.season),
  });

  const players = { ...league.players };
  const prospect = players[prospectId] as BasketballPlayer;
  players[prospectId] = {
    ...prospect,
    contract,
    rosterSlot: { teamId: team.id, bucket: 'active', index: team.playerIds.length },
  };

  const teams = league.teams.map(t =>
    t.id === team.id
      ? {
          ...t,
          playerIds: [...t.playerIds, prospectId],
          rosterBuckets: {
            ...t.rosterBuckets,
            active: [...(t.rosterBuckets.active ?? []), prospectId],
          },
        }
      : t,
  );

  const picks = draft.picks.map((p, i) =>
    i === draft.currentPick ? { ...p, prospectId } : p,
  );
  const currentPick = draft.currentPick + 1;
  const nextDraft: DraftState = {
    ...draft,
    picks,
    poolIds: draft.poolIds.filter(id => id !== prospectId),
    currentPick,
    complete: currentPick >= picks.length,
  };

  return {
    ...league,
    players,
    teams,
    sportData: { ...(league.sportData as LeagueSportData), draft: nextDraft },
  };
}

/** Make the current pick automatically via the AI. */
export function autoPickCurrent(league: LeagueState): LeagueState {
  const draft = getDraft(league);
  if (!draft || draft.complete) return league;
  const prospectId = recommendedProspectId(league, draft);
  if (!prospectId) return league;
  return makeDraftPick(league, prospectId);
}

/** Auto-pick until the user's team is on the clock or the draft ends. */
export function autoPickUntilUser(league: LeagueState, userTeamId: TeamId | null): LeagueState {
  let l = league;
  // Hard cap at 60 iterations — the draft is finite.
  for (let i = 0; i < 60; i++) {
    const draft = getDraft(l);
    const slot = draft ? currentSlot(draft) : null;
    if (!slot) break;
    if (userTeamId && slot.teamId === userTeamId) break;
    l = autoPickCurrent(l);
  }
  return l;
}

/** Set the lottery-revealed flag (cosmetic gate for the reveal animation). */
export function revealLottery(league: LeagueState): LeagueState {
  const draft = getDraft(league);
  if (!draft) return league;
  return {
    ...league,
    sportData: {
      ...(league.sportData as LeagueSportData),
      draft: { ...draft, lotteryRevealed: true },
    },
  };
}
