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
  basketballTeamPayroll,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import { extensionMarket } from './extension';
import { teamDeadCap } from './deadCap';
import { upcomingSeason } from '../draft/draft';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
export type ResignDecision = 'resign' | 'walk';

export interface ResignProjection {
  /** The season the cap figures are for — `upcomingSeason`, matching what Free
   *  Agency prices (so re-sign and FA show one consistent number). */
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
  // Re-sign EXTENSIONS commit to the season AFTER the player's existing deal
  // expires, which for an expiring (1-year-left) candidate is currentSeason + 1
  // regardless of inaugural status. Previously this used `upcomingSeason(league)`
  // (which is the DRAFT year — currentSeason + 1 normally, but currentSeason for
  // an inaugural import). That made every imported 1-year-left player register
  // as "already re-signed" (their existing 2026 contract covered the inaugural's
  // 2026 nextSeason), bricking the re-sign UI before the user made any choices
  // (BUG-21). currentSeason + 1 matches what `extensionMarket.startSeason`
  // returns for those candidates and gives a clean pending → resigned transition.
  // The cap picture MUST match what Free Agency shows, so both windows price the
  // SAME season: `upcomingSeason` — the season you're building, which is what FA
  // signs for. In a normal offseason that already equals currentSeason + 1; only
  // the inaugural import diverged (imported rosters are signed for the current
  // season, so FA prices it while extensions begin the year after), which is what
  // made re-sign read +cap space while FA read over-the-cap for the same roster.
  const capSeason = upcomingSeason(league);
  // Expiring-player detection still keys off the season an extension would BEGIN
  // (after the current deal ends = currentSeason + 1), so imported 1-year-left
  // players still surface as re-signable rather than "already kept" (BUG-21).
  const extensionSeason = league.currentSeason + 1;
  const cap = basketballSalaryCap(capSeason);
  const taxLine = basketballTaxThreshold(capSeason);
  const firstApron = basketballFirstApron(capSeason);
  const secondApron = basketballSecondApron(capSeason);

  const roster = team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);

  // Committed payroll for capSeason — computed EXACTLY as Free Agency's `capRoom`
  // does (via basketballTeamPayroll: includes dead money, excludes two-ways), so
  // the two screens can never disagree on the number.
  const committed = basketballTeamPayroll(
    roster, capSeason, teamDeadCap(team as Parameters<typeof teamDeadCap>[0], capSeason),
  );

  // Pending = expiring players (no extension-season deal) you haven't walked.
  const pendingAsk = roster.reduce((s, p) => {
    if (hasSalaryForSeason(p, extensionSeason)) return s;     // already kept / multi-year
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

  return { nextSeason: capSeason, cap, committed, projectedSpace, pendingAsk, roomIfAllReSigned, taxLine, overTaxBy, apron };
}
