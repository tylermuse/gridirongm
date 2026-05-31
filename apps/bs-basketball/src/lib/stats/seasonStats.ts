/**
 * Season stats aggregated from game box scores.
 *
 * IMPORTANT: `player.seasonStats` is NOT maintained during the season — the sim
 * writes per-game box scores onto each game, but never rolls them up onto the
 * player. Awards / recap / history all aggregate lazily from box scores, and so
 * must any UI that shows season averages (roster, dashboard, player page).
 * Reading `player.seasonStats` directly just shows zeros.
 */

import {
  emptyBasketballStats,
  addBasketballStats,
  type BasketballStats,
} from '@bs/sport-basketball';
import type { BaseGameResult, BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;
type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

function isPlayoffGame(g: GameResult): boolean {
  return !!(g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff;
}

/** Per-player regular-season stat totals, summed from played-game box scores
 *  (each box score carries gamesPlayed: 1, so GP/averages come out right). */
export function regularSeasonStatsByPlayer(league: LeagueState): Map<PlayerId, BasketballStats> {
  const acc = new Map<PlayerId, BasketballStats>();
  for (const g of league.games as GameResult[]) {
    if (g.status !== 'played' || isPlayoffGame(g)) continue;
    for (const pid of Object.keys(g.boxScores) as PlayerId[]) {
      const cur = acc.get(pid) ?? emptyBasketballStats();
      acc.set(pid, addBasketballStats(cur, g.boxScores[pid]));
    }
  }
  return acc;
}

/** Lookup with an empty-stats fallback. */
export function statsForPlayer(
  map: Map<PlayerId, BasketballStats>,
  id: string,
): BasketballStats {
  return map.get(id as PlayerId) ?? emptyBasketballStats();
}
