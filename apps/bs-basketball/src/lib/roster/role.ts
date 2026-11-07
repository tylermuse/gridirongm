/**
 * Who a team is actually starting right now, for anything that judges a player's
 * role (mood, trade requests, contract talks).
 */

import type { BasketballPlayer, BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import { getDiscipline, isSuspendedOn } from '../discipline';
import { getInjuries, isInjuredOn } from '../injuries';
import { resolveLineup } from '../lineup';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * The lineup's starters plus whoever fills in for an unavailable one. Games leave
 * injured and suspended players out and promote from the bench, so a fill-in
 * playing starter minutes isn't "riding the bench"; the absent starter keeps his
 * role too.
 */
export function effectiveStarterIds(
  league: LeagueState,
  team: BasketballTeam,
  roster: BasketballPlayer[],
): Set<string> {
  const starters = new Set<string>(resolveLineup(team, roster).starters.filter(id => !!id) as string[]);
  const day = league.currentTick;
  const injuries = getInjuries(league);
  const discipline = getDiscipline(league);
  const available = roster.filter(p => !isInjuredOn(injuries, p.id, day) && !isSuspendedOn(discipline, p.id, day));
  if (available.length === roster.length) return starters;
  for (const id of resolveLineup(team, available).starters) if (id) starters.add(id);
  return starters;
}
