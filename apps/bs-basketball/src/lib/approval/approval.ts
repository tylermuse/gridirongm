/**
 * GM tenure + approval (Phase 2E-5).
 *
 * At each rollover the user team's owner/fan approval moves based on the season
 * just played: wins vs a baseline expectation, and how far the playoff run went.
 * Owner approval drives job security; a low enough rating gets the GM fired,
 * which clears `userTeamId` and flags a "pick a new team" state.
 *
 * Owner objectives (lib/owner/objectives.ts) add a SEPARATE, bounded term on
 * top of the results swing: met +4 / partial +1 / missed −4 each, clamped to
 * ±10, added after the ±30 results clamp. Results still dominate; objectives
 * decide borderline seasons. Saves with no stored objectives for the season
 * get a 0 term (exactly the pre-objectives behavior).
 *
 * Only the user team is tracked (job security is a user concept). Fan approval
 * driving revenue is a v1 placeholder — the number is surfaced, not yet spent.
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { userPlayoffResult, type PlayoffResult } from './playoffResult';
import {
  gradeSeasonObjectives,
  objectiveApprovalDelta,
  storeObjectiveGrades,
  type GradeOptions,
  type ObjectiveGrade,
} from '../owner/objectives';

export { userPlayoffResult };

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type JobSecurity = 'safe' | 'warm' | 'hot' | 'final_warning';

export type { PlayoffResult } from './playoffResult';

/** Baseline win expectation (a .500-ish playoff push). */
const EXPECTED_WINS = 41;
/** Owner approval below this marks a season as sub-threshold ("below the line"). */
const FIRE_THRESHOLD = 20;
/** No firing within the first N seasons of a tenure — rebuilds need runway. */
const GRACE_SEASONS = 3;
/** Consecutive sub-threshold seasons required to actually fire (one is a warning). */
const STRIKES_TO_FIRE = 2;

interface LeagueSportData {
  gmFired?: { season: number; teamId: TeamId; teamName: string };
  /** Teams with a GM vacancy the fired user may take over (worst records). */
  gmOpenings?: TeamId[];
  /** Season the current GM took over their team (set on pick/takeover). Anchors
   *  the firing grace period. Absent on old saves → lazy-defaulted to the
   *  current season (a fresh, lenient grace window). */
  gmTenureStartSeason?: number;
  /** Run of consecutive sub-threshold seasons; reset by any at/above-line season
   *  or a takeover. Two in a row (past the grace window) fires the GM (BUG-22). */
  gmConsecutiveBadSeasons?: number;
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

export interface ApprovalUpdate {
  league: LeagueState;
  fired: boolean;
  summary: string;
  /** Owner-approval points from objective grades (0 when none were set). */
  objectiveDelta: number;
  objectiveGrades: ObjectiveGrade[];
}

/**
 * Apply the end-of-season approval swing for the user team. Returns the updated
 * league (with the team's approval + jobSecurity), and whether the GM was fired
 * (in which case userTeamId is cleared and a gmFired flag is set).
 */
export function applySeasonApproval(input: LeagueState, opts: GradeOptions = {}): ApprovalUpdate {
  const teamId = input.userTeamId;
  if (!teamId) return { league: input, fired: false, summary: '', objectiveDelta: 0, objectiveGrades: [] };
  const team = input.teams.find(t => t.id === teamId);
  if (!team) return { league: input, fired: false, summary: '', objectiveDelta: 0, objectiveGrades: [] };

  // Grade this season's owner objectives (if any were set) and archive them.
  const graded = gradeSeasonObjectives(input, opts);
  const objectiveGrades = graded?.grades ?? [];
  const objectiveDelta = objectiveApprovalDelta(objectiveGrades);
  const league = graded ? storeObjectiveGrades(input, graded.set, objectiveGrades, objectiveDelta) : input;

  const result = userPlayoffResult(league, teamId);
  const winsDelta = team.record.wins - EXPECTED_WINS;
  const playoffScore = PLAYOFF_SCORE[result];

  const resultsDelta = clamp(Math.round(winsDelta * 0.6 + playoffScore), -30, 30);
  const ownerDelta = resultsDelta + objectiveDelta;
  const fanDelta = clamp(Math.round(winsDelta * 0.5 + playoffScore * 1.3), -30, 35);

  const ownerApproval = clamp(team.approval.ownerApproval + ownerDelta, 0, 100);
  const fanApproval = clamp(team.approval.fanApproval + fanDelta, 0, 100);

  const sd = league.sportData as LeagueSportData;
  // Firing is no longer pure accumulation (BUG-22): it takes a SUSTAINED slump.
  // A season is "below the line" when owner approval sits sub-threshold; one such
  // season is a final warning, two in a row fires — but never within the grace
  // window of a fresh tenure. Old saves lazily anchor tenure to the current
  // season (a lenient fresh grace).
  const tenureStart = sd.gmTenureStartSeason ?? league.currentSeason;
  const tenureSeasons = league.currentSeason - tenureStart + 1; // incl. season just played
  const inGracePeriod = tenureSeasons <= GRACE_SEASONS;
  const belowLine = ownerApproval < FIRE_THRESHOLD;
  const consecutiveBad = belowLine ? (sd.gmConsecutiveBadSeasons ?? 0) + 1 : 0;
  const fired = belowLine && consecutiveBad >= STRIKES_TO_FIRE && !inGracePeriod;
  // On the hot seat (sub-threshold but spared) → final warning; otherwise tier.
  const jobSecurity: JobSecurity = belowLine ? 'final_warning' : jobSecurityFor(ownerApproval);

  const teams = league.teams.map(t =>
    t.id === teamId
      ? { ...t, approval: { ...t.approval, ownerApproval, fanApproval, jobSecurity } }
      : t,
  );

  const teamName = `${team.city} ${team.name}`;
  // GM openings: a handful of the worst-performing other clubs are looking for a
  // new front office — that's where a fired GM can land.
  const gmOpenings = league.teams
    .filter(t => t.id !== teamId)
    .sort((a, b) => (a.record.wins - a.record.losses) - (b.record.wins - b.record.losses))
    .slice(0, 5)
    .map(t => t.id);
  // Always persist tenure tracking (lazy-anchored start + the consecutive-bad
  // run); add the fired flags only on an actual firing.
  const tenureSd: LeagueSportData = {
    ...sd,
    gmTenureStartSeason: tenureStart,
    gmConsecutiveBadSeasons: consecutiveBad,
  };
  const updated: LeagueState = {
    ...league,
    teams,
    userTeamId: fired ? null : league.userTeamId,
    sportData: fired
      ? { ...tenureSd, gmFired: { season: league.currentSeason, teamId, teamName }, gmOpenings }
      : tenureSd,
  };

  const onFinalWarning = belowLine && !fired;
  const metCount = objectiveGrades.filter(g => g.grade === 'met').length;
  const objectiveNote = objectiveGrades.length
    ? ` Objectives: ${metCount}/${objectiveGrades.length} met (${objectiveDelta >= 0 ? '+' : ''}${objectiveDelta}).`
    : '';
  const summary = `Your team ${PLAYOFF_LABEL[result]} (${team.record.wins}–${team.record.losses}). ` +
    (fired
      ? `Ownership has let you go.`
      : onFinalWarning
        ? `Owner approval ${ownerDelta >= 0 ? '+' : ''}${ownerDelta} — ownership has put you on notice. One more season like this and you're out.`
        : `Owner approval ${ownerDelta >= 0 ? '+' : ''}${ownerDelta}, fan approval ${fanDelta >= 0 ? '+' : ''}${fanDelta}.`) +
    objectiveNote;

  return { league: updated, fired, summary, objectiveDelta, objectiveGrades };
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
