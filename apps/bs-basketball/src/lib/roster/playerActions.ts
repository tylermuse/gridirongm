/**
 * Small contract helpers for the roster page. Release lives in lib/freeAgency
 * (releasePlayer); extension negotiation lives in lib/roster/extension.
 */

import type { BasketballPlayer } from '@bs/sport-basketball';

/** Years remaining on a player's deal, counting the current season. */
export function contractYearsLeft(player: BasketballPlayer, season: number): number {
  if (!player.contract) return 0;
  return player.contract.years.filter(y => y.season >= season).length;
}
