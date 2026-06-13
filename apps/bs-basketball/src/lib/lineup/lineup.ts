/**
 * Lineup management (Phase 2D-7).
 *
 * Persists a user-set rotation on `team.sportData.lineup` and resolves which
 * lineup the sim should use. The saved lineup is used as-is when valid; when it's
 * stale (a starter got injured / traded / released) it is REPAIRED in place
 * rather than discarded — the user's available starters keep their slots and the
 * user's bench order is preserved, with only the gaps filled. Wholesale rebuilds
 * to the OVR-default used to silently re-promote deliberately-benched stars back
 * into the starting five (and starter minutes), which was BUG-11.
 */

import {
  buildDefaultBasketballLineup,
  validateBasketballLineup,
  basketballPositionGroup,
  type BasketballLineup,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** Canonical starter-slot positions, in lineup order. */
const SLOT_POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function getTeamLineup(team: BasketballTeam): BasketballLineup | null {
  return team.sportData.lineup ?? null;
}

/** The lineup the sim should use: the saved one if it's valid for the current
 *  roster, otherwise a repaired version that preserves the user's intent. */
export function resolveLineup(team: BasketballTeam, roster: BasketballPlayer[]): BasketballLineup {
  const saved = getTeamLineup(team);
  if (!saved) return buildDefaultBasketballLineup(roster);
  if (validateBasketballLineup(saved, roster).valid) return saved;
  return repairLineup(saved, roster);
}

/**
 * Repair a stale/invalid saved lineup against the currently-available roster.
 * Keeps each starter slot whose player is still available; fills the rest from
 * the user's bench order (position-matched first), then any leftover roster
 * players. The benched-by-the-user players stay benched unless they're needed to
 * fill a hole — so the user's starter/bench intent (and minutes) is honored even
 * after an injury, instead of reverting to "highest OVR starts".
 */
export function repairLineup(saved: BasketballLineup, roster: BasketballPlayer[]): BasketballLineup {
  const byId = new Map<string, BasketballPlayer>(roster.map(p => [p.id, p]));
  const available = (id: string): boolean => byId.has(id);
  const used = new Set<string>();

  // Replacement pool, in priority order: the user's bench (their chosen order),
  // then any roster player the saved lineup didn't reference at all.
  const referenced = new Set<string>([...saved.starters, ...saved.bench]);
  const fillPool = [
    ...saved.bench.filter(available),
    ...roster.filter(p => !referenced.has(p.id)).map(p => p.id),
  ];
  const takeFromPool = (slotPos: BasketballPosition): string | null => {
    // Prefer a player in the slot's position GROUP (guards/forwards/center),
    // matching the flexible-lineup model (FEAT-21), then anyone available.
    const slotGroup = basketballPositionGroup(slotPos);
    const match = fillPool.find(
      id => !used.has(id) && byId.get(id) && basketballPositionGroup(byId.get(id)!.sportData.position) === slotGroup,
    );
    const pick = match ?? fillPool.find(id => !used.has(id));
    return pick ?? null;
  };

  const starters: string[] = [];
  for (let slot = 0; slot < 5; slot++) {
    const cur = saved.starters[slot];
    if (cur && available(cur) && !used.has(cur)) {
      starters.push(cur);
      used.add(cur);
      continue;
    }
    const replacement = takeFromPool(SLOT_POSITIONS[slot]);
    if (replacement) {
      starters.push(replacement);
      used.add(replacement);
    } else {
      starters.push(''); // roster too thin to fill — sim/validation handles the edge
    }
  }

  // Bench keeps the user's order: their available bench players not now starting,
  // then any leftover available roster players appended.
  const bench = [
    ...saved.bench.filter(id => available(id) && !used.has(id)),
    ...roster.filter(p => !referenced.has(p.id) && !used.has(p.id)).map(p => p.id),
  ];

  return {
    starters: starters as BasketballLineup['starters'],
    bench,
    backupsByPosition: saved.backupsByPosition,
    pace: saved.pace,
  };
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
