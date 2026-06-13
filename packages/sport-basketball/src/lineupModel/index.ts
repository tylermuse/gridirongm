/**
 * @bs/sport-basketball/lineupModel — 5-starter rotation lineup with backups.
 */

import type { LineupModelDescriptor } from '@bs/core/adapter';
import {
  buildDefaultLineupAdapter,
  validateLineupAdapter,
  type BasketballLineup,
} from './lineupModel';

export {
  buildDefaultBasketballLineup,
  validateBasketballLineup,
  basketballPositionGroup,
  isInPositionAtSlot,
} from './lineupModel';
// BasketballLineup type is owned by ../types; consumers should import it
// from @bs/sport-basketball/types (or the root barrel).

/** The full LineupModelDescriptor object the adapter exposes. */
export const basketballLineupModel: LineupModelDescriptor<BasketballLineup> = {
  kind: 'rotation',
  buildDefault: buildDefaultLineupAdapter,
  validate: validateLineupAdapter,
};
