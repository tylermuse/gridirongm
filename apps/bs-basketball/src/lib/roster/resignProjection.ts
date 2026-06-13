/**
 * Live cap projection for the re-sign window (parity with football's projected
 * cap math). Re-signing commits NEXT-season dollars, so the relevant number is
 * next season's cap space — recomputed from the actual contracts every render.
 * Re-signing a player adds his next-season salary (space drops); letting him walk
 * leaves it off (and drops him from the "if everyone's kept" figure).
 */

import {
  basketballSalaryCap,
  basketballTaxThreshold,
  basketballFirstApron,
  basketballSecondApron,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import { extensionMarket } from './extension';
import { getDraft } from '../draft';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
export type ResignDecision = 'resign' | 'walk';

export interface ResignProjection {
  nextSeason: number;
  cap: number;
  /** Next-season payroll already committed (multi-year deals + ones you re-signed). */
  committed: number;
  /** cap − committed. Drops with each re-sign. */
  projectedSpace: number;
  /** Σ market asks of expiring players still undecided (would-be cost to keep them). */
  pendingAsk: number;
  /** Space left if you re-signed everyone still pending. Rises with each Let Walk. */
  roomIfAllReSigned: number;
  taxLine: number;
  /** Projected luxury-tax overage at next-season payroll. */
  overTaxBy: number;
  apron: { text: string; color: string };
}

/** A player's salary in a given season from his actual contract (0 if none). */
export function salaryForSeason(player: BasketballPlayer, season: number): number {
  const years = player.contract?.years ?? [];
  return years
    .filter(y => y.season === season)
    .reduce((s, y) => s + y.baseSalary + y.proratedBonus, 0);
}

/** Does the player have a contract covering `season`? */
export function hasSalaryForSeason(player: BasketballPlayer, season: number): boolean {
  return (player.contract?.years ?? []).some(y => y.season === season);
}

export function resignProjection(
  league: LeagueState,
  team: BasketballTeam,
  decisions: Record<string, ResignDecision>,
): ResignProjection {
  // Re-sign dollars commit to the upcoming season's draft year. In the normal
  // offseason the draft is for currentSeason + 1 (unchanged); for an imported
  // league's inaugural draft it's currentSeason itself (no year roll), so anchor
  // to the draft season to keep the cap tiles + "kept" filter correct (BUG-20).
  const nextSeason = getDraft(league)?.season ?? league.currentSeason + 1;
  const cap = basketballSalaryCap(nextSeason);
  const taxLine = basketballTaxThreshold(nextSeason);
  const firstApron = basketballFirstApron(nextSeason);
  const secondApron = basketballSecondApron(nextSeason);

  const roster = team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);

  // Committed next-season payroll = everyone already under contract for it
  // (includes players you just re-signed — extendPlayer wrote the deal).
  const committed = roster.reduce((s, p) => s + salaryForSeason(p, nextSeason), 0);

  // Pending = expiring players (no next-season deal) you haven't decided to walk.
  const pendingAsk = roster.reduce((s, p) => {
    if (hasSalaryForSeason(p, nextSeason)) return s;          // already kept / multi-year
    if (decisions[p.id] === 'walk') return s;                 // decided to let walk
    return s + extensionMarket(p, league.currentSeason).marketSalary;
  }, 0);

  const projectedSpace = cap - committed;
  const roomIfAllReSigned = projectedSpace - pendingAsk;
  const overTaxBy = Math.max(0, committed - taxLine);

  const apron = committed >= secondApron ? { text: 'Over 2nd apron', color: '#dc2626' }
    : committed >= firstApron ? { text: 'Over 1st apron', color: '#dc2626' }
    : committed >= taxLine ? { text: 'In luxury tax', color: '#d97706' }
    : committed >= cap ? { text: 'Over the cap', color: '#d97706' }
    : { text: 'Under the cap', color: '#10b981' };

  return { nextSeason, cap, committed, projectedSpace, pendingAsk, roomIfAllReSigned, taxLine, overTaxBy, apron };
}
