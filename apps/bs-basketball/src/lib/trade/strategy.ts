/**
 * Team trade disposition (P1.4).
 *
 * Derives a one-line posture for a team from its record, roster age, and cap
 * sheet — the same signal football surfaces as "Strategy: Developing". It feeds
 * two places so the hint is truthful: the trade UI (shown on partner select)
 * and the AI accept logic (a rebuilder values youth + picks more, a win-now
 * team pays a premium for proven help).
 */

import {
  basketballTeamCapStatus,
  type BasketballPlayer,
  type BasketballTeam,
  type TeamDisposition,
} from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface TeamStrategy {
  disposition: TeamDisposition;
  /** Short label for the chip, e.g. "Rebuilding — wants youth & picks". */
  blurb: string;
}

const BLURB: Record<TeamDisposition, string> = {
  Rebuilding: 'Rebuilding — wants youth & draft picks',
  Developing: 'Developing — building around a young core',
  Contending: 'Contending — wants win-now help',
  'Win Now': 'Win Now — all-in, willing to move picks',
};

function rosterOf(league: LeagueState, team: BasketballTeam): BasketballPlayer[] {
  return team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
}

/** Classify a team's trade posture. Mirrors football's getTeamStrategy. */
export function teamStrategy(league: LeagueState, teamId: TeamId): TeamStrategy {
  const team = league.teams.find(t => t.id === teamId) as BasketballTeam | undefined;
  if (!team) return { disposition: 'Contending', blurb: BLURB.Contending };

  const roster = rosterOf(league, team);
  const games = team.record.wins + team.record.losses;
  const winPct = games > 0 ? team.record.wins / games : 0.5;
  const avgAge = roster.length ? roster.reduce((s, p) => s + p.age, 0) / roster.length : 26;
  const cap = basketballTeamCapStatus(roster, league.currentSeason);
  const capPct = cap.cap > 0 ? cap.payroll / cap.cap : 0;

  let disposition: TeamDisposition;
  if (winPct < 0.35) disposition = 'Rebuilding';
  else if (winPct >= 0.6 && capPct > 0.9) disposition = 'Win Now';
  else if (winPct >= 0.5 && avgAge < 26) disposition = 'Developing';
  else if (winPct >= 0.5) disposition = 'Contending';
  else if (avgAge < 26) disposition = 'Developing';
  else disposition = 'Rebuilding';

  return { disposition, blurb: BLURB[disposition] };
}
