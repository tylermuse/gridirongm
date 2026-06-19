/**
 * Season awards computation (Phase 2D-2).
 *
 * Pure, lazy, and derived entirely from league state — nothing is persisted,
 * so this is immune to the save-shape backward-compat concerns that bit the
 * playoffs work. Call it whenever you need the ceremony (the /awards page, the
 * playoff-finish modal); it recomputes deterministically from box scores.
 *
 * The engine (`computeBasketballAwards`) reads each player's `seasonStats`, but
 * the sim never writes those — it only emits per-game box scores onto
 * `league.games[].boxScores`. So we first aggregate the regular-season box
 * scores back into per-player season totals, then hand inflated player copies
 * to the engine. Finals MVP uses Finals-only box scores + the champion from the
 * playoff bracket.
 */

import {
  computeBasketballAwards,
  emptyBasketballStats,
  addBasketballStats,
  type BasketballAwardWinners,
  type BasketballStats,
  type BasketballPlayer,
  type TeamSeasonRecord,
} from '@bs/sport-basketball';
import type {
  BaseGameResult,
  BaseLeagueState,
  CoachId,
  PlayerId,
  TeamId,
} from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export interface SeasonAwards {
  season: number;
  winners: BasketballAwardWinners;
  /** Aggregated regular-season totals per player, for stat-line display. */
  seasonStats: Map<PlayerId, BasketballStats>;
  /** Aggregated Finals-only totals per player (null until a champion exists). */
  finalsStats: Map<PlayerId, BasketballStats> | null;
  championTeamId: TeamId | null;
}

function isPlayoffGame(g: GameResult): boolean {
  return !!(g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff;
}

function seriesIdOf(g: GameResult): string | undefined {
  return (g.sportData as { seriesId?: string } | undefined)?.seriesId;
}

/** Sum the box scores of the games matching `filter` into per-player totals. */
function aggregateStats(
  games: GameResult[],
  filter: (g: GameResult) => boolean,
): Map<PlayerId, BasketballStats> {
  const acc = new Map<PlayerId, BasketballStats>();
  for (const g of games) {
    if (g.status !== 'played' || !filter(g)) continue;
    for (const pid of Object.keys(g.boxScores) as PlayerId[]) {
      const box = g.boxScores[pid];
      const cur = acc.get(pid) ?? emptyBasketballStats();
      acc.set(pid, addBasketballStats(cur, box));
    }
  }
  return acc;
}

/** Reconstruct a `BasketballStats`-shaped object from a `seasonLog` entry.
 *  The log only carries aggregated per-game numbers (ppg/rpg/apg), so we
 *  multiply back up by GP and zero the rest of the fields. Used to feed MIP
 *  the prior-season baseline it needs (BUG-27 — MIP was returning null in
 *  every season because no priorSeasonPlayers list was being computed). */
function reconstructStatsFromLog(entry: {
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
}): BasketballStats {
  const stats = emptyBasketballStats();
  stats.gamesPlayed = entry.gamesPlayed;
  stats.points = entry.ppg * entry.gamesPlayed;
  stats.totalRebounds = entry.rpg * entry.gamesPlayed;
  stats.assists = entry.apg * entry.gamesPlayed;
  return stats;
}

/**
 * Compute the full set of season awards. Returns null only if no regular-season
 * games have been played yet (nothing to award). Finals MVP is populated only
 * once the playoff bracket has a champion.
 */
export function computeSeasonAwards(league: LeagueState): SeasonAwards | null {
  const playedRegular = league.games.some(g => g.status === 'played' && !isPlayoffGame(g));
  if (!playedRegular) return null;

  const seasonStats = aggregateStats(league.games, g => !isPlayoffGame(g));

  // Hand the engine player copies with their aggregated season totals.
  const players = Object.values(league.players) as BasketballPlayer[];
  const playersWithStats: BasketballPlayer[] = players.map(p => ({
    ...p,
    seasonStats: seasonStats.get(p.id) ?? emptyBasketballStats(),
  }));

  const teamRecords: TeamSeasonRecord[] = league.teams.map(t => ({
    teamId: t.id,
    wins: t.record.wins,
    losses: t.record.losses,
    pointsFor: t.record.pointsFor,
    pointsAgainst: t.record.pointsAgainst,
    headCoachId: t.coachIds[0] as CoachId | undefined,
  }));

  const bracket = getBracket(league);
  const championTeamId = bracket?.championTeamId ?? null;

  const finalsStats = championTeamId
    ? aggregateStats(league.games, g => seriesIdOf(g) === 'FINALS')
    : null;

  // Prior-season players for MIP (BUG-27). The seasonLog on each player carries
  // a year-by-year aggregate written at the offseason rollover; we pick each
  // player's most recent logged season as his "prior" baseline. Using the
  // most-recent-with-stats (rather than strict `currentSeason - 1`) is the
  // right call for buried/injured vets whose YOY comparison anchors on the
  // last year they actually played. Players with no log get no baseline and
  // simply don't appear as MIP candidates — which is correct.
  const priorSeasonPlayers: BasketballPlayer[] = [];
  for (const p of players) {
    const log = (p.sportData.seasonLog ?? []) as Array<{
      season: number; gamesPlayed: number; ppg: number; rpg: number; apg: number;
    }>;
    if (log.length === 0) continue;
    const prior = log[log.length - 1];
    if (prior.season >= league.currentSeason) continue; // only PRIOR seasons
    priorSeasonPlayers.push({ ...p, seasonStats: reconstructStatsFromLog(prior) });
  }

  const winners = computeBasketballAwards(playersWithStats, teamRecords, {
    championshipTeamId: championTeamId ?? undefined,
    finalsStats: finalsStats ? Object.fromEntries(finalsStats) as Record<PlayerId, BasketballStats> : undefined,
    priorSeasonPlayers,
    minGamesPlayed: 50,
  });

  return { season: league.currentSeason, winners, seasonStats, finalsStats, championTeamId };
}
