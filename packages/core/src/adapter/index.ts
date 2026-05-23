/**
 * @bs/core/adapter — public surface of the SportAdapter contract.
 *
 * Consumers import the SportAdapter interface, base types, and discriminated
 * unions from here. The concrete sport implementations live in @bs/sport-*
 * packages and import these contracts.
 *
 *   import type { SportAdapter, BasePlayer, BaseTeam } from '@bs/core/adapter';
 *
 * The ./sketches subfolder contains reference adapter sketches for football,
 * basketball, and hockey. They're checked in for documentation and as the
 * starting point for the eventual @bs/sport-* packages, but they're not
 * exported from this index — consumers shouldn't depend on them as runnable
 * code.
 */

export type * from './SportAdapter';
export type * from './BaseTypes';
