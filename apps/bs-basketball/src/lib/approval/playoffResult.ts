/**
 * Playoff-result helper, split out of approval.ts so the owner-objectives
 * module can grade playoff objectives without an import cycle
 * (approval.ts → owner/objectives.ts → here).
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type PlayoffResult =
  | 'champion' | 'finals' | 'conf_finals' | 'second_round' | 'first_round' | 'missed';

/** How far `teamId` advanced in the (completed) playoff bracket. */
export function userPlayoffResult(league: LeagueState, teamId: TeamId): PlayoffResult {
  const bracket = getBracket(league);
  if (!bracket) return 'missed';
  if (bracket.championTeamId === teamId) return 'champion';
  if (bracket.runnerUpTeamId === teamId) return 'finals';
  const inField = [...bracket.seeds.Eastern, ...bracket.seeds.Western].includes(teamId);
  if (!inField) return 'missed';

  let maxRound = 0;
  for (const series of bracket.rounds.flat()) {
    if (series.teamA === teamId || series.teamB === teamId) maxRound = Math.max(maxRound, series.round);
  }
  if (maxRound >= 3) return 'conf_finals';
  if (maxRound === 2) return 'second_round';
  return 'first_round';
}

