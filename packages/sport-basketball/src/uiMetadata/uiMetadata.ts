/**
 * Basketball UI metadata.
 *
 * Declarative description of how the UI should render basketball-specific
 * content: rating cards, stat tables, position groupings, and lineup
 * rendering. The core/UI consumes these through the SportAdapter contract.
 *
 * Adding a new rating or stat field?
 *   1. Update BasketballRatings / BasketballStats in src/types
 *   2. Add a descriptor here so the UI surfaces it
 *   3. The leaders/stat pages pick it up automatically
 */

import type { UiMetadata, LineupDescription, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballPosition, BasketballLineup } from '../types';

// ===========================================================================
// Rating field descriptors — grouped for the player card UI
// ===========================================================================

const ratingFields = [
  // Shooting
  { key: 'threePoint', label: '3PT', group: 'Shooting' },
  { key: 'midRange', label: 'MID', group: 'Shooting' },
  { key: 'finishing', label: 'FIN', group: 'Shooting' },
  { key: 'freeThrow', label: 'FT', group: 'Shooting' },
  { key: 'postScoring', label: 'POST', group: 'Shooting' },
  // Playmaking
  { key: 'handles', label: 'HND', group: 'Playmaking' },
  { key: 'passing', label: 'PAS', group: 'Playmaking' },
  // Defense
  { key: 'perimeterDefense', label: 'PRM', group: 'Defense' },
  { key: 'interiorDefense', label: 'INT', group: 'Defense' },
  { key: 'rebounding', label: 'REB', group: 'Defense' },
  { key: 'steal', label: 'STL', group: 'Defense' },
  { key: 'block', label: 'BLK', group: 'Defense' },
  // Athletic
  { key: 'speed', label: 'SPD', group: 'Athletic' },
  { key: 'vertical', label: 'VRT', group: 'Athletic' },
  { key: 'strength', label: 'STR', group: 'Athletic' },
  // Mental
  { key: 'basketballIQ', label: 'IQ', group: 'Mental' },
  { key: 'intangibles', label: 'ITG', group: 'Mental' },
] as const;

// ===========================================================================
// Stat column descriptors — for box scores + leaders pages
// ===========================================================================

const statColumns = [
  { key: 'points', label: 'PTS', category: 'Scoring', format: 'decimal' as const, higherIsBetter: true },
  { key: 'totalRebounds', label: 'REB', category: 'Rebounds', format: 'decimal' as const, higherIsBetter: true },
  { key: 'offensiveRebounds', label: 'OREB', category: 'Rebounds', format: 'decimal' as const, higherIsBetter: true },
  { key: 'defensiveRebounds', label: 'DREB', category: 'Rebounds', format: 'decimal' as const, higherIsBetter: true },
  { key: 'assists', label: 'AST', category: 'Playmaking', format: 'decimal' as const, higherIsBetter: true },
  { key: 'turnovers', label: 'TO', category: 'Playmaking', format: 'decimal' as const, higherIsBetter: false },
  { key: 'steals', label: 'STL', category: 'Defense', format: 'decimal' as const, higherIsBetter: true },
  { key: 'blocks', label: 'BLK', category: 'Defense', format: 'decimal' as const, higherIsBetter: true },
  { key: 'fouls', label: 'PF', category: 'Defense', format: 'decimal' as const, higherIsBetter: false },
  { key: 'fieldGoalsMade', label: 'FGM', category: 'Shooting', format: 'integer' as const, higherIsBetter: true },
  { key: 'fieldGoalsAttempted', label: 'FGA', category: 'Shooting', format: 'integer' as const, higherIsBetter: true },
  { key: 'threePointsMade', label: '3PM', category: 'Shooting', format: 'integer' as const, higherIsBetter: true },
  { key: 'threePointsAttempted', label: '3PA', category: 'Shooting', format: 'integer' as const, higherIsBetter: true },
  { key: 'freeThrowsMade', label: 'FTM', category: 'Shooting', format: 'integer' as const, higherIsBetter: true },
  { key: 'freeThrowsAttempted', label: 'FTA', category: 'Shooting', format: 'integer' as const, higherIsBetter: true },
  { key: 'minutesPlayed', label: 'MIN', category: 'Usage', format: 'decimal' as const, higherIsBetter: true },
  { key: 'plusMinus', label: '+/-', category: 'Impact', format: 'decimal' as const, higherIsBetter: true },
] as const;

// ===========================================================================
// Position groups — for depth chart display
// ===========================================================================

const positionGroups = [
  { label: 'Backcourt', positions: ['PG', 'SG'] as BasketballPosition[] },
  { label: 'Wing', positions: ['SF'] as BasketballPosition[] },
  { label: 'Frontcourt', positions: ['PF', 'C'] as BasketballPosition[] },
] as const;

// ===========================================================================
// Lineup description — render the rotation as groups for the UI
// ===========================================================================

const STARTER_POSITION_LABELS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export function describeBasketballLineup(lineup: BasketballLineup): LineupDescription {
  const startersGroup = {
    label: 'Starters',
    slots: STARTER_POSITION_LABELS.map((pos, i) => ({
      label: pos,
      playerId: (lineup.starters[i] || null) as PlayerId | null,
      isStarter: true,
    })),
  };

  const benchGroup = {
    label: 'Bench',
    slots: lineup.bench.map((id, i) => ({
      label: `${i + 1}`,
      playerId: id as PlayerId | null,
      isStarter: false,
    })),
  };

  const backupsGroup = {
    label: 'Position Backups',
    slots: STARTER_POSITION_LABELS.map(pos => ({
      label: pos,
      playerId: lineup.backupsByPosition[pos],
      isStarter: false,
    })),
  };

  return { groups: [startersGroup, benchGroup, backupsGroup] };
}

// ===========================================================================
// Assembled UiMetadata object — matches @bs/core/adapter contract
// ===========================================================================

export const basketballUiMetadata: UiMetadata<
  BasketballRatings,
  BasketballStats,
  BasketballPosition,
  BasketballLineup
> = {
  ratingFields: ratingFields as unknown as UiMetadata<
    BasketballRatings,
    BasketballStats,
    BasketballPosition,
    BasketballLineup
  >['ratingFields'],
  statColumns: statColumns as unknown as UiMetadata<
    BasketballRatings,
    BasketballStats,
    BasketballPosition,
    BasketballLineup
  >['statColumns'],
  positionGroups,
  themeOverrides: {
    accentColor: '#E66B00', // basketball orange
    accentColorAlt: '#1D428A', // NBA-style navy
  },
  describeLineup: describeBasketballLineup,
};

// Export individual constants too, for tests that want to assert the shape
// without going through the UiMetadata generic indirection.
export { ratingFields, statColumns, positionGroups };
