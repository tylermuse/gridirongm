/**
 * Team-level season stats aggregated from game box scores.
 *
 * Mirrors `regularSeasonStatsByPlayer` but rolls the totals up by team in two
 * directions per team:
 *
 *   off — what THIS team's players put up
 *   def — what OPPONENTS put up against this team
 *
 * Used by /stats to show offensive + defensive shooting splits (FG%, 3P%, etc.)
 * for the Team Stats table.
 *
 * Note on mid-season trades: we map each box-score player to a team via the
 * player's CURRENT rosterSlot. If a player was traded mid-season, his pre-trade
 * games get attributed to his new team. This is rare enough to ignore in v1;
 * if it ever matters we'd need to record a per-game team alongside each box
 * score in the engine.
 */

import {
  emptyBasketballStats,
  addBasketballStats,
  type BasketballPlayer,
  type BasketballStats,
} from '@bs/sport-basketball';
import type { BaseGameResult, BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;
type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface TeamSeasonAggregate {
  /** Total stats produced by this team's players (offense). */
  off: BasketballStats;
  /** Total stats opponents produced against this team (defense). */
  def: BasketballStats;
  /** Regular-season games played (counted from played non-playoff games). */
  gp: number;
}

function isPlayoffGame(g: GameResult): boolean {
  return !!(g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff;
}

/** Per-team regular-season offense + defense totals. Always includes every
 *  league team in the result map (with zero stats / gp=0 if they haven't
 *  played yet) so callers can iterate `league.teams` without nil-checking. */
export function regularSeasonStatsByTeam(
  league: LeagueState,
): Map<TeamId, TeamSeasonAggregate> {
  // Snapshot current player → team mapping once.
  const playerTeam = new Map<PlayerId, TeamId>();
  for (const [pid, raw] of Object.entries(league.players)) {
    const slot = (raw as BasketballPlayer).rosterSlot;
    if (slot?.teamId) playerTeam.set(pid as PlayerId, slot.teamId);
  }

  const acc = new Map<TeamId, TeamSeasonAggregate>();
  for (const t of league.teams) {
    acc.set(t.id as TeamId, {
      off: emptyBasketballStats(),
      def: emptyBasketballStats(),
      gp: 0,
    });
  }

  for (const g of league.games as GameResult[]) {
    if (g.status !== 'played' || isPlayoffGame(g)) continue;
    const homeAgg = acc.get(g.homeTeamId);
    const awayAgg = acc.get(g.awayTeamId);
    if (!homeAgg || !awayAgg) continue;

    for (const pid of Object.keys(g.boxScores) as PlayerId[]) {
      const playerTm = playerTeam.get(pid);
      if (!playerTm) continue;
      const line = g.boxScores[pid] as BasketballStats;
      if (playerTm === g.homeTeamId) {
        homeAgg.off = addBasketballStats(homeAgg.off, line);
        awayAgg.def = addBasketballStats(awayAgg.def, line);
      } else if (playerTm === g.awayTeamId) {
        awayAgg.off = addBasketballStats(awayAgg.off, line);
        homeAgg.def = addBasketballStats(homeAgg.def, line);
      }
    }
    homeAgg.gp += 1;
    awayAgg.gp += 1;
  }

  return acc;
}
