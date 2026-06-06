/**
 * Positional needs for the draft (parity 1/§A/§D). Pure: counts a team's
 * rostered players per position vs a target depth and scores the shortfall.
 * Shared by the On-The-Clock needs row, Best Fit, the board's roster snapshot,
 * and the Your Needs card.
 */

import type { BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
/** Healthy depth per position on a ~15-man roster. */
export const TARGET_DEPTH = 3;

export interface PositionNeed {
  position: BasketballPosition;
  count: number;
  /** 0 (well-stocked) → 100 (empty). */
  needScore: number;
}

export function positionNeeds(team: BasketballTeam, players: Record<string, BasketballPlayer>): PositionNeed[] {
  const counts: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const id of team.playerIds) {
    const p = players[id];
    if (p) counts[p.sportData.position]++;
  }
  return POSITIONS
    .map(position => ({
      position,
      count: counts[position],
      needScore: Math.max(0, Math.round(((TARGET_DEPTH - counts[position]) / TARGET_DEPTH) * 100)),
    }))
    .sort((a, b) => b.needScore - a.needScore);
}

/** Need score for one position (0 if none). */
export function needBonus(needs: PositionNeed[], position: BasketballPosition): number {
  return needs.find(n => n.position === position)?.needScore ?? 0;
}
