/**
 * Gameplay telemetry for BS Hoops — the property builders behind the league
 * store's `league_created` / `day_simmed` / `season_completed` / `gm_fired` /
 * `team_picked` events. Ported from BS Football's store.ts (same property
 * names) so the admin funnel + season-outcome queries run with app='bs-hoops'.
 *
 * `app` and `device_id` are NOT set here: the shared ingest handler
 * (createTrackHandler('bs-hoops') in @bs/core/analytics/server) stamps both on
 * every row server-side.
 *
 * Pure (no trackEvent calls) so the mappings are unit-testable; the store
 * decides WHEN to emit.
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * How far the user's team got, in the cross-sport analytics vocabulary.
 * `missed`, `conference`, `runnerup` and `champion` mean the same thing as in
 * BS Football; the first two rounds use Hoops names (Football sends
 * `wildcard` / `divisional` in those slots).
 *
 *   missed      never reached the 16-team bracket — includes play-in losers
 *   firstround  lost in the First Round                     (bracket round 1)
 *   semis       lost in the Conference Semifinals           (round 2)
 *   conference  lost in the Conference Finals               (round 3)
 *   runnerup    lost the Finals                             (round 4)
 *   champion    won the Finals
 *
 * Note: owner approval (lib/approval) grades a play-in loser as a first-round
 * exit; telemetry follows the NBA convention that the play-in is not the
 * playoffs. `play_in` on the event disambiguates.
 */
export type TelemetryPlayoffResult = 'missed' | 'firstround' | 'semis' | 'conference' | 'runnerup' | 'champion';

export function telemetryPlayoffResult(league: LeagueState, teamId: TeamId): TelemetryPlayoffResult {
  const bracket = getBracket(league);
  if (!bracket) return 'missed';
  if (bracket.championTeamId === teamId) return 'champion';
  if (bracket.runnerUpTeamId === teamId) return 'runnerup';
  let maxRound = 0;
  for (const series of bracket.rounds.flat()) {
    if (series.teamA === teamId || series.teamB === teamId) maxRound = Math.max(maxRound, series.round);
  }
  if (maxRound >= 3) return 'conference';
  if (maxRound === 2) return 'semis';
  if (maxRound === 1) return 'firstround';
  return 'missed';
}

/** True when `teamId` played in this season's play-in tournament. */
function playedInPlayIn(league: LeagueState, teamId: TeamId): boolean {
  return (getBracket(league)?.playIn ?? []).some(s => s.teamA === teamId || s.teamB === teamId);
}

/** Seasons finished in this save before the current one (Football's
 *  `seasonHistory.length`). Imports start with an empty history. */
export function seasonsCompleted(league: LeagueState): number {
  return Object.keys(league.seasonHistory ?? {}).length;
}

/** Phase the league opens in: a generated league (and a preseason import)
 *  opens before tip-off, a mid-season import in the regular season, a
 *  pre-/post-draft import at the draft / re-sign step. */
export function startMode(league: LeagueState): string {
  switch (league.currentPhase) {
    case 'regular_season': return 'regular';
    case 'preseason': return 'preseason';
    case 'offseason': return 'offseason';
    default: return league.currentPhase;
  }
}

/** File name of a roster URL, without the cache-bust query (Football parity). */
export function rosterFileName(url: string): string | null {
  return url.split('/').pop()?.split('?')[0] || null;
}

export type DaySimMode = 'day' | 'next_game' | 'watch_game' | 'week' | 'deadline' | 'season';

/** `day_simmed` properties. Hoops is day-based, so this is deliberately a
 *  different event from Football's `week_simmed`. `league` is the pre-sim
 *  snapshot (a regular-season sim never changes the season). */
export function daySimmedProps(league: LeagueState, mode: DaySimMode, days: number, games: number): Record<string, unknown> {
  return {
    mode,
    days,
    games,
    season: league.currentSeason,
    seasons_completed: seasonsCompleted(league),
    spectator: !league.userTeamId,
  };
}

/**
 * `season_completed` properties for the season `league` (the pre-rollover
 * snapshot, playoffs complete) is about to close, or null when that season is
 * already in history (it was rolled over before — never report it twice).
 * `seasons_completed` counts the season just finished, like Football.
 */
export function seasonCompletedProps(league: LeagueState): Record<string, unknown> | null {
  const history = league.seasonHistory ?? {};
  if (history[league.currentSeason] != null) return null;
  const teamId = league.userTeamId;
  const team = teamId ? league.teams.find(t => t.id === teamId) : undefined;
  return {
    season: league.currentSeason,
    seasons_completed: seasonsCompleted(league) + 1,
    wins: team ? team.record.wins : null,
    losses: team ? team.record.losses : null,
    playoff_result: team ? telemetryPlayoffResult(league, team.id) : null,
    play_in: team ? playedInPlayIn(league, team.id) : false,
    spectator: !team,
  };
}
