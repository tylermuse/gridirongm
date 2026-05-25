/**
 * @bs/sport-basketball/awards — season-end awards engine.
 *
 * Public surface:
 *   - computeBasketballAwards(players, teams, opts) → BasketballAwardWinners
 */

export {
  computeBasketballAwards,
} from './awards';
export type {
  AwardResult,
  BasketballAwardWinners,
  TeamSeasonRecord,
  ComputeAwardsOptions,
} from './awards';
