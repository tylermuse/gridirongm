/**
 * Lineup management (Phase 2D-7).
 *
 * Persists a user-set rotation on `team.sportData.lineup` and resolves which
 * lineup the sim should use: the saved one when it's still valid for the current
 * roster, otherwise the auto-built default. The validity check is what keeps a
 * stale lineup (after a trade / release / retirement) from breaking the sim — it
 * silently falls back instead.
 */

import {
  buildDefaultBasketballLineup,
  validateBasketballLineup,
  type BasketballLineup,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export function getTeamLineup(team: BasketballTeam): BasketballLineup | null {
  return team.sportData.lineup ?? null;
}

/** The lineup the sim should use: the saved one if it has no validity
 *  violations against `roster`, otherwise the freshly built default. */
export function resolveLineup(team: BasketballTeam, roster: BasketballPlayer[]): BasketballLineup {
  const saved = getTeamLineup(team);
  if (saved && validateBasketballLineup(saved, roster).valid) return saved;
  return buildDefaultBasketballLineup(roster);
}

/** Persist a lineup onto a team. Returns a new league. */
export function setTeamLineup(
  league: LeagueState,
  teamId: TeamId,
  lineup: BasketballLineup,
): LeagueState {
  const teams = league.teams.map(t =>
    t.id === teamId
      ? ({ ...t, sportData: { ...(t as BasketballTeam).sportData, lineup } } as typeof t)
      : t,
  );
  return { ...league, teams };
}

export { buildDefaultBasketballLineup, validateBasketballLineup };
