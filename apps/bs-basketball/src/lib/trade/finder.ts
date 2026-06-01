/**
 * Trade finder + incoming offers (parity audit #6).
 *
 * No separate AI value model — every suggestion is validated through the real
 * evaluateTrade/isExecutable engine, so anything surfaced is a legal deal both
 * sides accept. Deterministic (no RNG): packages are tried in OVR order.
 */

import { evaluateTrade, isExecutable, type TradeSideInput } from './trade';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface DealSuggestion {
  partnerTeamId: string;
  /** Player ids the user sends. */
  giveIds: string[];
  /** Player ids the user receives. */
  getIds: string[];
}

function sides(userTeamId: string, partnerId: string, give: string[], get: string[]): TradeSideInput[] {
  return [
    { teamId: userTeamId as TradeSideInput['teamId'], playerIds: give as TradeSideInput['playerIds'] },
    { teamId: partnerId as TradeSideInput['teamId'], playerIds: get as TradeSideInput['playerIds'] },
  ];
}

function rosterByOvr(league: LeagueState, teamId: string): BasketballPlayer[] {
  const players = league.players as Record<string, BasketballPlayer>;
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return [];
  return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p).sort((a, b) => b.ratings.overall - a.ratings.overall);
}

/** Realistic packages other teams would give for one of the user's players. */
export function findDealsForPlayer(league: LeagueState, userPlayerId: string, maxResults = 10): DealSuggestion[] {
  const userTeamId = league.userTeamId;
  if (!userTeamId) return [];
  const target = (league.players as Record<string, BasketballPlayer>)[userPlayerId];
  if (!target) return [];
  const tOvr = target.ratings.overall;
  const out: DealSuggestion[] = [];

  for (const ai of league.teams) {
    if (ai.id === userTeamId) continue;
    const aiPlayers = rosterByOvr(league, ai.id);

    // Single-player swaps in a sensible OVR band.
    const singles = aiPlayers.filter(p => p.ratings.overall >= tOvr - 3 && p.ratings.overall <= tOvr + 8).slice(0, 3);
    let matched = false;
    for (const cand of singles) {
      const s = sides(userTeamId, ai.id, [userPlayerId], [cand.id]);
      if (isExecutable(evaluateTrade(league, s), s)) { out.push({ partnerTeamId: ai.id, giveIds: [userPlayerId], getIds: [cand.id] }); matched = true; break; }
    }
    // Two-for-one for a star: pair a mid starter with a role player.
    if (!matched && tOvr >= 76) {
      const pair = aiPlayers.filter(p => p.ratings.overall >= tOvr - 12 && p.ratings.overall < tOvr + 2).slice(0, 4);
      outer: for (let i = 0; i < pair.length; i++) {
        for (let j = i + 1; j < pair.length; j++) {
          const get = [pair[i].id, pair[j].id];
          const s = sides(userTeamId, ai.id, [userPlayerId], get);
          if (isExecutable(evaluateTrade(league, s), s)) { out.push({ partnerTeamId: ai.id, giveIds: [userPlayerId], getIds: get }); break outer; }
        }
      }
    }
  }

  const ovr = (ids: string[]) => ids.reduce((s, id) => s + ((league.players as Record<string, BasketballPlayer>)[id]?.ratings.overall ?? 0), 0);
  return out.sort((a, b) => ovr(b.getIds) - ovr(a.getIds)).slice(0, maxResults);
}

/** AI-initiated offers: deals available for the user's most valuable players. */
export function incomingOffers(league: LeagueState, maxOffers = 4): DealSuggestion[] {
  const userTeamId = league.userTeamId;
  if (!userTeamId) return [];
  const mine = rosterByOvr(league, userTeamId).slice(0, 6);
  const offers: DealSuggestion[] = [];
  for (const p of mine) {
    const deals = findDealsForPlayer(league, p.id, 1);
    if (deals.length) offers.push(deals[0]);
    if (offers.length >= maxOffers) break;
  }
  return offers;
}
