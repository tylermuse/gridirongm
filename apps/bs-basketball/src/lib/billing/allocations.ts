import { getScoutingAllocations, type ScoutingAllocations, type Tier } from '@bs/core/billing';

/**
 * BS Hoops scouting/intel allotments. Same as the shared Football table except
 * free-tier scout points: an NBA draft is only 2 rounds, so free gets 5 points
 * per draft instead of Football's 10. Premium (30) and founders/admins
 * (unlimited) are unchanged, as are FA intel reports (3 free / 9 Premium).
 */
export const HOOPS_FREE_SCOUT_POINTS = 5;

export function getHoopsScoutingAllocations(tier: Tier, isFounder: boolean): ScoutingAllocations {
  const base = getScoutingAllocations(tier, isFounder);
  if (base.isUnlimited || tier === 'premium') return base;
  return { ...base, scoutPoints: HOOPS_FREE_SCOUT_POINTS };
}
