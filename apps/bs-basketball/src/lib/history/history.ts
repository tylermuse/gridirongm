/**
 * League history (Phase 2E-4).
 *
 * At rollover we snapshot the completed season into `league.seasonHistory[year]`
 * — champion, runner-up, Finals MVP, MVP, and scoring leader — with player
 * names/teams denormalized so the record survives roster churn. The /history
 * route reads these back; career stats are accumulated separately into
 * `player.careerStats` at the same point (see season/advanceSeason).
 */

import { perGame, type BasketballPlayer } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';
import { computeSeasonAwards } from '../awards';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface HistoryPlayerRef {
  id: string;
  name: string;
  teamId: TeamId | null;
  /** Short stat line for display, e.g. "28.4 / 8.1 / 6.0". */
  statline: string;
}

export interface SeasonHistoryEntry {
  season: number;
  champion: TeamId | null;
  runnerUp: TeamId | null;
  finalsMvp: HistoryPlayerRef | null;
  mvp: HistoryPlayerRef | null;
  scoringLeader: HistoryPlayerRef | null;
}

function nameOf(league: LeagueState, id: PlayerId): string {
  const p = league.players[id] as BasketballPlayer | undefined;
  return p ? `${p.firstName} ${p.lastName}` : String(id);
}
function teamOf(league: LeagueState, id: PlayerId): TeamId | null {
  return (league.players[id] as BasketballPlayer | undefined)?.rosterSlot?.teamId ?? null;
}

/**
 * Build the history entry for the just-finished season. Call BEFORE players are
 * aged and games are replaced (i.e. at the top of enterOffseason).
 */
export function buildSeasonHistoryEntry(league: LeagueState): SeasonHistoryEntry {
  const bracket = getBracket(league);
  const awards = computeSeasonAwards(league);
  const w = awards?.winners;

  const mvpRef = (): HistoryPlayerRef | null => {
    const id = w?.mvp?.winnerId as PlayerId | undefined;
    if (!id) return null;
    const pg = perGame(awards!.seasonStats.get(id) ?? zero());
    return {
      id, name: nameOf(league, id), teamId: w!.mvp!.teamId ?? teamOf(league, id),
      statline: `${(pg.points ?? 0).toFixed(1)} / ${(pg.totalRebounds ?? 0).toFixed(1)} / ${(pg.assists ?? 0).toFixed(1)}`,
    };
  };

  const finalsMvpRef = (): HistoryPlayerRef | null => {
    const id = w?.finalsMvp?.winnerId as PlayerId | undefined;
    if (!id) return null;
    const pg = perGame(awards!.finalsStats?.get(id) ?? zero());
    return {
      id, name: nameOf(league, id), teamId: w!.finalsMvp!.teamId ?? teamOf(league, id),
      statline: `${(pg.points ?? 0).toFixed(1)} PPG in the Finals`,
    };
  };

  const scoringLeaderRef = (): HistoryPlayerRef | null => {
    if (!awards) return null;
    let bestId: PlayerId | null = null;
    let bestPpg = -1;
    for (const [id, stats] of awards.seasonStats) {
      if ((stats.gamesPlayed ?? 0) < 1) continue;
      const ppg = stats.points / stats.gamesPlayed;
      if (ppg > bestPpg) { bestPpg = ppg; bestId = id; }
    }
    if (!bestId) return null;
    return {
      id: bestId, name: nameOf(league, bestId), teamId: teamOf(league, bestId),
      statline: `${bestPpg.toFixed(1)} PPG`,
    };
  };

  return {
    season: league.currentSeason,
    champion: bracket?.championTeamId ?? null,
    runnerUp: bracket?.runnerUpTeamId ?? null,
    finalsMvp: finalsMvpRef(),
    mvp: mvpRef(),
    scoringLeader: scoringLeaderRef(),
  };
}

/** All recorded seasons, newest first. */
export function getSeasonHistory(league: LeagueState): SeasonHistoryEntry[] {
  return Object.values(league.seasonHistory as Record<number, SeasonHistoryEntry>)
    .filter((e): e is SeasonHistoryEntry => !!e && typeof (e as SeasonHistoryEntry).season === 'number')
    .sort((a, b) => b.season - a.season);
}

function zero(): BasketballStats {
  return {
    gamesPlayed: 0, gamesStarted: 0, minutes: 0, points: 0,
    fieldGoalsMade: 0, fieldGoalsAttempted: 0, threePointsMade: 0, threePointsAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0, assists: 0, turnovers: 0,
    offensiveRebounds: 0, defensiveRebounds: 0, totalRebounds: 0,
    steals: 0, blocks: 0, personalFouls: 0, plusMinus: 0, trueShootingAttempts: 0,
  };
}
