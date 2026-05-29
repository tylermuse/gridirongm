/**
 * @bs/sport-basketball/sim — basketball simulation engine.
 *
 * Public surface for the v1 box-score sim. The game loop (game.ts, coming
 * next) composes these into full-game simulations.
 *
 * Architecture:
 *   - rng.ts: deterministic seeded PRNG
 *   - shotModel.ts: shot type selection + make probability
 *   - possession.ts: single-possession resolver (composes shot model + rebound)
 *   - game.ts (TODO): full-game loop wrapping ~200 possessions
 */

export { createRng } from './rng';
export type { Rng } from './rng';

export {
  selectShotType,
  makeProbability,
  isContested,
  drewShootingFoul,
} from './shotModel';
export type { ShotType, ShotResolution } from './shotModel';

export {
  simPossession,
  AVG_POSSESSION_SECONDS,
} from './possession';
export type {
  SimLineup,
  StatEvent,
  StatEventField,
  PossessionResult,
} from './possession';

export {
  simBasketballGame,
  simBasketballGameSimple,
} from './game';
export type {
  BasketballGameSide,
  BasketballGameContext,
  BasketballGameSettings,
  BasketballGameData,
} from './game';
