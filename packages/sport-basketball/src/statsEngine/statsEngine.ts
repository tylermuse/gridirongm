/**
 * Basketball stats engine.
 *
 * Implements the StatsEngine<BasketballStats> contract from @bs/core/adapter:
 *   - empty(): zero stats object
 *   - accumulate(target, source): field-by-field addition
 *   - derived(stats): computed values (TS%, eFG%, per-game splits)
 *   - format(key, value): display formatting
 *
 * Delegates the heavy lifting to the existing helpers in ../types and
 * ../capRules-adjacent code where it makes sense.
 */

import type { StatsEngine } from '@bs/core/adapter';
import {
  emptyBasketballStats,
  addBasketballStats,
  trueShootingPct,
  effectiveFieldGoalPct,
  type BasketballStats,
} from '../types';

// ===========================================================================
// Helpers
// ===========================================================================

const PERCENT_FIELDS: ReadonlySet<string> = new Set([
  'fgPct', 'tpPct', 'ftPct', 'ts', 'efg',
]);

const INTEGER_FIELDS: ReadonlySet<string> = new Set([
  'fieldGoalsMade', 'fieldGoalsAttempted',
  'threePointsMade', 'threePointsAttempted',
  'freeThrowsMade', 'freeThrowsAttempted',
  'gamesPlayed', 'gamesStarted',
]);

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

// ===========================================================================
// StatsEngine implementation
// ===========================================================================

export const basketballStatsEngine: StatsEngine<BasketballStats> = {
  empty(_kind?: string): BasketballStats {
    // Basketball is uniform-shape — `kind` ignored.
    return emptyBasketballStats();
  },

  accumulate(target: BasketballStats, source: Partial<BasketballStats>): BasketballStats {
    return addBasketballStats(target, source);
  },

  derived(stats: BasketballStats): Record<string, number | string> {
    const games = Math.max(1, stats.gamesPlayed || 1);
    return {
      ppg: +(stats.points / games).toFixed(1),
      rpg: +(stats.totalRebounds / games).toFixed(1),
      apg: +(stats.assists / games).toFixed(1),
      spg: +(stats.steals / games).toFixed(1),
      bpg: +(stats.blocks / games).toFixed(1),
      topg: +(stats.turnovers / games).toFixed(1),
      mpg: +(stats.minutes / games).toFixed(1),
      fgPct: +safeDivide(stats.fieldGoalsMade, stats.fieldGoalsAttempted).toFixed(3),
      tpPct: +safeDivide(stats.threePointsMade, stats.threePointsAttempted).toFixed(3),
      ftPct: +safeDivide(stats.freeThrowsMade, stats.freeThrowsAttempted).toFixed(3),
      ts: +trueShootingPct(stats).toFixed(3),
      efg: +effectiveFieldGoalPct(stats).toFixed(3),
    };
  },

  format(statKey: keyof BasketballStats | string, value: number): string {
    const key = String(statKey);
    if (PERCENT_FIELDS.has(key)) {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (INTEGER_FIELDS.has(key)) {
      return Math.round(value).toString();
    }
    // Most stats are per-game decimals with 1 decimal place
    return value.toFixed(1);
  },
};
