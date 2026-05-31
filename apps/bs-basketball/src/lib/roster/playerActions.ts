/**
 * Front-office player actions for the roster page: extend a contract, plus a
 * couple of contract helpers. Release lives in lib/freeAgency (releasePlayer).
 */

import {
  basketballMarketSalary,
  basketballMarketContractYears,
  type BasketballPlayer,
} from '@bs/sport-basketball';
import type { BaseContract } from '@bs/core/adapter';

/** Years remaining on a player's deal, counting the current season. */
export function contractYearsLeft(player: BasketballPlayer, season: number): number {
  if (!player.contract) return 0;
  return player.contract.years.filter(y => y.season >= season).length;
}

/**
 * Extend a player: append market-value years onto the end of the current deal
 * (or write a fresh one if they have none). Flat, fully guaranteed — the same
 * market model free agency and league creation use.
 */
export function extendContract(player: BasketballPlayer, season: number): BaseContract {
  const salary = basketballMarketSalary(player, { season, noiseSeed: `${player.id}-ext` });
  const addYears = Math.min(3, Math.max(1, basketballMarketContractYears(player)));
  const existing = player.contract?.years ?? [];
  const lastSeason = existing.length ? Math.max(...existing.map(y => y.season)) : season - 1;
  const newYears = Array.from({ length: addYears }, (_, i) => ({
    season: lastSeason + 1 + i,
    baseSalary: salary,
    proratedBonus: 0,
    guaranteed: true,
  }));
  const years = [...existing, ...newYears];
  return {
    years,
    signedSeason: player.contract?.signedSeason ?? season,
    guaranteedAtSigning: years.reduce((s, y) => s + y.baseSalary, 0),
    modifications: player.contract?.modifications ?? [],
    sportData: player.contract?.sportData ?? {},
  };
}
