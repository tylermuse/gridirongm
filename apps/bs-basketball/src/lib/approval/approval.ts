/**
 * GM tenure + approval (Phase 2E-5).
 *
 * At each rollover the user team's owner/fan approval moves based on the season
 * just played: wins vs a baseline expectation, and how far the playoff run went.
 * Owner approval drives job security; a low enough rating gets the GM fired,
 * which clears `userTeamId` and flags a "pick a new team" state.
 *
 * Only the user team is tracked (job security is a user concept). Fan approval
 * driving revenue is a v1 placeholder — the number is surfaced, not yet spent.
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type JobSecurity = 'safe' | 'warm' | 'hot' | 'final_warning';

export type PlayoffResult =
  | 'champion' | 'finals' | 'conf_finals' | 'second_round' | 'first_round' | 'missed';

/** Baseline win expectation (a .500-ish playoff push). */
const EXPECTED_WINS = 41;
/** Owner approval below this fires the GM. */
const FIRE_THRESHOLD = 20;

interface LeagueSportData {
  gmFired?: { season: number; teamId: TeamId; teamName: string };
  /** Teams with a GM vacancy the fired user may take over (worst records). */
  gmOpenings?: TeamId[];
  [key: string]: unknown;
}

const PLAYOFF_SCORE: Record<PlayoffResult, number> = {
  champion: 25, finals: 16, conf_finals: 10, second_round: 5, first_round: 0, missed: -12,
};

const PLAYOFF_LABEL: Record<PlayoffResult, string> = {
  champion: 'won the title', finals: 'reached the Finals', conf_finals: 'reached the Conference Finals',
  second_round: 'reached the second round', first_round: 'lost in the first round', missed: 'missed the playoffs',
};

export function jobSecurityFor(ownerApproval: number): JobSecurity {
  if (ownerApproval >= 60) return 'safe';
  if (ownerApproval >= 45) return 'warm';
  if (ownerApproval >= 30) return 'hot';
  return 'final_warning';
}

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

export interface ApprovalUpdate {
  league: LeagueState;
  fired: boolean;
  summary: string;
}

/**
 * Apply the end-of-season approval swing for the user team. Returns the updated
 * league (with the team's approval + jobSecurity), and whether the GM was fired
 * (in which case userTeamId is cleared and a gmFired flag is set).
 */
export function applySeasonApproval(league: LeagueState): ApprovalUpdate {
  const teamId = league.userTeamId;
  if (!teamId) return { league, fired: false, summary: '' };
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return { league, fired: false, summary: '' };

  const result = userPlayoffResult(league, teamId);
  const winsDelta = team.record.wins - EXPECTED_WINS;
  const playoffScore = PLAYOFF_SCORE[result];

  const ownerDelta = clamp(Math.round(winsDelta * 0.6 + playoffScore), -30, 30);
  const fanDelta = clamp(Math.round(winsDelta * 0.5 + playoffScore * 1.3), -30, 35);

  const ownerApproval = clamp(team.approval.ownerApproval + ownerDelta, 0, 100);
  const fanApproval = clamp(team.approval.fanApproval + fanDelta, 0, 100);
  const fired = ownerApproval < FIRE_THRESHOLD;
  const jobSecurity = jobSecurityFor(ownerApproval);

  const teams = league.teams.map(t =>
    t.id === teamId
      ? { ...t, approval: { ...t.approval, ownerApproval, fanApproval, jobSecurity } }
      : t,
  );

  const sd = league.sportData as LeagueSportData;
  const teamName = `${team.city} ${team.name}`;
  // GM openings: a handful of the worst-performing other clubs are looking for a
  // new front office — that's where a fired GM can land.
  const gmOpenings = league.teams
    .filter(t => t.id !== teamId)
    .sort((a, b) => (a.record.wins - a.record.losses) - (b.record.wins - b.record.losses))
    .slice(0, 5)
    .map(t => t.id);
  const updated: LeagueState = {
    ...league,
    teams,
    userTeamId: fired ? null : league.userTeamId,
    sportData: fired
      ? { ...sd, gmFired: { season: league.currentSeason, teamId, teamName }, gmOpenings }
      : sd,
  };

  const summary = `Your team ${PLAYOFF_LABEL[result]} (${team.record.wins}–${team.record.losses}). ` +
    (fired
      ? `Ownership has let you go.`
      : `Owner approval ${ownerDelta >= 0 ? '+' : ''}${ownerDelta}, fan approval ${fanDelta >= 0 ? '+' : ''}${fanDelta}.`);

  return { league: updated, fired, summary };
}

export function getGmFired(league: LeagueState): LeagueSportData['gmFired'] {
  return (league.sportData as LeagueSportData | undefined)?.gmFired;
}

/** Team ids with a GM vacancy the fired user can take over (empty if not fired). */
export function getGmOpenings(league: LeagueState): TeamId[] {
  return (league.sportData as LeagueSportData | undefined)?.gmOpenings ?? [];
}

/** Clear the fired flag (called when the user takes over a new team). */
export function clearGmFired(league: LeagueState): LeagueState {
  const sd = { ...(league.sportData as LeagueSportData) };
  delete sd.gmFired;
  delete sd.gmOpenings;
  return { ...league, sportData: sd };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
