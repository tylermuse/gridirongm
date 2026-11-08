import type { PlayEvent } from './playByPlay';

/** The spot / down / possession a scorebug shows. */
export interface Situation {
  possession: 'home' | 'away';
  fieldPos: number;
  down: number;
  yardsToGo: number;
}

/** What the live-coach engine reports about its current state (a subset of LiveEngineState). */
export interface EngineSituation extends Situation {
  isGameOver: boolean;
  awaitingXpChoice: boolean;
  awaitingKickoffChoice: boolean;
  awaitingTwoPointCall?: boolean;
}

/**
 * The situation for the NEXT snap once the play on screen is over, or null to keep the current play's own numbers.
 *
 * Play events carry the situation at their snap. Once a play's animation (2D and 3D) is done, the scorebug should
 * move on: to the next event's pre-snap situation, or to the engine's state when Live Coach hasn't generated the
 * next play yet. Without this the page header and drive ribbon sat one play behind the 3D scorebug ("1st & 10" next
 * to "stuffed for no gain"), and after Auto-sim to End they fell back to an old possession (QA 11/8).
 *
 * Kickoffs and tries keep the current play's numbers: their events carry special spots, and the 3D sim forms
 * those itself.
 */
export function nextSnapSituation(
  next: PlayEvent | null | undefined,
  engine: EngineSituation | null | undefined,
): Situation | null {
  if (next) return next.type === 'kickoff' || next.type === 'extra_point' ? null : next;
  if (!engine || engine.isGameOver || engine.awaitingXpChoice || engine.awaitingKickoffChoice || engine.awaitingTwoPointCall) return null;
  return engine;
}
