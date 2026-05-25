/**
 * @bs/sport-basketball/draftSystem — NBA draft mechanics.
 *
 * Public surface:
 *   - generateBasketballDraftOrder — lottery + reverse-standings → pick order
 *   - aiBasketballDraftPick — auto-pick best prospect for a team
 *   - basketballPickValue — numeric pick value for trade evaluation
 *   - rookieScaleContract — first-contract generator for drafted players
 */

export {
  generateBasketballDraftOrder,
  basketballPickValue,
} from './draftOrder';
export type {
  StandingsEntry,
  DraftOrderOptions,
} from './draftOrder';

export { aiBasketballDraftPick } from './aiPick';
export type { TeamRosterSnapshot, AiPickOptions } from './aiPick';

export { rookieScaleContract, DEFAULT_CAP_REFERENCE } from './rookieScale';
export type { RookieContractOptions } from './rookieScale';
