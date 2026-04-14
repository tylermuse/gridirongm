// ---------------------------------------------------------------------------
// GameFieldState: visual state of the field at any moment
// ---------------------------------------------------------------------------

import type { PlayEvent } from '@/lib/engine/playByPlay';
import {
  type FormationType,
  type DefFormationType,
  type DotPosition,
  OFFENSE_FORMATIONS,
  DEFENSE_FORMATIONS,
  selectFormation,
} from './formations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DotState {
  x: number;       // yard position on field (0=left endzone, 100=right endzone for canvas)
  y: number;       // lateral position (0=top, 1=bottom)
  label: string;
  role: 'offense' | 'defense';
}

export interface GameFieldState {
  possession: 'home' | 'away';
  ballYard: number;        // absolute yard (0-100, 0=away endzone, 100=home endzone)
  scrimmageYard: number;   // absolute yard of LOS
  firstDownYard: number;   // absolute yard of first down marker
  offenseDots: DotState[];
  defenseDots: DotState[];
  offenseFormation: FormationType;
  defenseFormation: DefFormationType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Convert "yards from possessing team's endzone" to absolute yard.
 *
 *  CANONICAL ORIENTATION: The possessing team ALWAYS drives left→right.
 *  - absYard 0 = possessing team's own endzone (left side of canvas)
 *  - absYard 100 = opponent's endzone (right side, where they're trying to score)
 *
 *  This is independent of home/away. When possession flips, the endzone
 *  labels swap to show who's driving, but the coordinate system stays the
 *  same: own goal = left, opponent goal = right. */
function toAbsoluteYard(fieldPos: number, _possession: 'home' | 'away'): number {
  return fieldPos;
}

/** Place formation dots relative to an absolute scrimmage yard.
 *  Canonical orientation: offense drives left→right (increasing absYard).
 *  Offense lines up BEHIND (to the left of) the LOS; defense in FRONT. */
function placeDots(
  formation: DotPosition[],
  scrimmageAbsYard: number,
  _possession: 'home' | 'away',
  role: 'offense' | 'defense',
): DotState[] {
  // Offense is behind LOS (lower absYard), defense in front (higher absYard).
  // dir = +1 always (canonical left→right). offenseDir flips for defense.
  const offenseDir = role === 'offense' ? -1 : 1;

  return formation.map(dot => {
    const absYard = clamp(
      scrimmageAbsYard + dot.yardOffset * offenseDir,
      0,
      100,
    );
    return {
      x: absYard,
      y: dot.lateral,
      label: dot.label,
      role,
    };
  });
}

// ---------------------------------------------------------------------------
// Derive field state from a PlayEvent
// ---------------------------------------------------------------------------

export function deriveFieldState(
  event: PlayEvent,
): GameFieldState {
  const { possession, fieldPos, down, yardsToGo, yardsGained, type } = event;

  const scrimmageAbsYard = toAbsoluteYard(fieldPos, possession);
  // Canonical: offense always drives left→right (+1 direction)
  const dir = 1;
  const firstDownAbsYard = clamp(scrimmageAbsYard + yardsToGo * dir, 0, 100);

  // Ball position after play result
  const ballAbsYard = clamp(scrimmageAbsYard + yardsGained * dir, 0, 100);

  // Select formation
  const { offense, defense } = selectFormation(type, down, yardsToGo, fieldPos);

  const offenseDots = placeDots(
    OFFENSE_FORMATIONS[offense],
    scrimmageAbsYard,
    possession,
    'offense',
  );
  const defenseDots = placeDots(
    DEFENSE_FORMATIONS[defense],
    scrimmageAbsYard,
    possession,
    'defense',
  );

  return {
    possession,
    ballYard: ballAbsYard,
    scrimmageYard: scrimmageAbsYard,
    firstDownYard: firstDownAbsYard,
    offenseDots,
    defenseDots,
    offenseFormation: offense,
    defenseFormation: defense,
  };
}

/** Default idle state when no event has been revealed yet */
export function idleFieldState(): GameFieldState {
  return {
    possession: 'home',
    ballYard: 25,
    scrimmageYard: 25,
    firstDownYard: 35,
    offenseDots: placeDots(OFFENSE_FORMATIONS.shotgun, 25, 'home', 'offense'),
    defenseDots: placeDots(DEFENSE_FORMATIONS.nickel, 25, 'home', 'defense'),
    offenseFormation: 'shotgun',
    defenseFormation: 'nickel',
  };
}
