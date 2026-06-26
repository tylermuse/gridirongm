/**
 * Dead-cap reader — standalone so the cap math (freeAgency, exceptions) can fold
 * dead money into payroll WITHOUT importing release.ts (which depends on
 * freeAgency, and would create an import cycle). release.ts writes these entries
 * when a player is waived (straight or stretched); here we just read them.
 */

import type { BasketballTeam } from '@bs/sport-basketball';

export interface DeadCapEntry {
  season: number;
  amount: number;
}

export function teamDeadCapEntries(team: BasketballTeam): DeadCapEntry[] {
  return (team.sportData as { deadCap?: DeadCapEntry[] }).deadCap ?? [];
}

/** Total dead-money cap charge a team carries in `season`. Counts fully against
 *  the cap / luxury tax / aprons (NBA rules). */
export function teamDeadCap(team: BasketballTeam, season: number): number {
  return teamDeadCapEntries(team)
    .filter(d => d.season === season)
    .reduce((s, d) => s + d.amount, 0);
}
