/**
 * Market-value contract generation, shared by league creation and the season
 * rollover (which re-signs players whose deals have expired). Length + salary
 * come from the same market model free agency uses; flat across the term, fully
 * guaranteed.
 */

import {
  basketballMarketSalary,
  basketballMarketContractYears,
  type BasketballPlayer,
} from '@bs/sport-basketball';
import type { BaseContract } from '@bs/core/adapter';

export function marketContract(player: BasketballPlayer, season: number): BaseContract {
  const salary = basketballMarketSalary(player, { season, noiseSeed: `${player.id}-${season}` });
  const years = basketballMarketContractYears(player);
  return {
    years: Array.from({ length: years }, (_, i) => ({
      season: season + i,
      baseSalary: salary,
      proratedBonus: 0,
      guaranteed: true,
    })),
    signedSeason: season,
    guaranteedAtSigning: salary * years,
    modifications: [],
    sportData: {},
  };
}

/** True when the player has a salary on the books for `season`. */
export function hasContractForSeason(player: BasketballPlayer, season: number): boolean {
  return !!player.contract?.years.some(y => y.season === season);
}
