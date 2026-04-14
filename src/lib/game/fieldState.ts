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
 *  USER-ANCHORED ORIENTATION: The user's endzone is ALWAYS on the left.
 *  - absYard 0 = user's endzone (left)
 *  - absYard 100 = opponent's endzone (right)
 *
 *  When the user has the ball: they drive left→right (fieldPos maps directly).
 *  When the opponent has the ball: they drive right→left (fieldPos is flipped
 *  so their own-25 starts near the right side).
 *
 *  The `possession` param tells us who has the ball. The `userSide` param
 *  (stored in module state, set by AnimatedField) tells us which side is
 *  the user. If not set, defaults to 'home'. */
let _userSide: 'home' | 'away' = 'home';
export function setUserSide(side: 'home' | 'away') { _userSide = side; }
export function getUserSide(): 'home' | 'away' { return _userSide; }

function toAbsoluteYard(fieldPos: number, possession: 'home' | 'away'): number {
  // User-anchored: user's endzone is on the LEFT (absYard 0).
  // User on offense: drives left→right. fieldPos maps directly.
  if (possession === _userSide) return fieldPos;
  // Opponent on offense: drives right→left. Their own-25 → absYard 75.
  return 100 - fieldPos;
}

/** Place formation dots relative to an absolute scrimmage yard.
 *  User-anchored: user drives left→right, opponent drives right→left. */
function placeDots(
  formation: DotPosition[],
  scrimmageAbsYard: number,
  possession: 'home' | 'away',
  role: 'offense' | 'defense',
): DotState[] {
  // Direction the offense faces: user team goes right (+1), opponent goes left (-1)
  const driveDir = possession === _userSide ? 1 : -1;
  // Offense is behind LOS, defense in front
  const offenseDir = role === 'offense' ? -1 : 1;

  return formation.map(dot => {
    const absYard = clamp(
      scrimmageAbsYard + dot.yardOffset * driveDir * offenseDir,
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
  // User-anchored: user drives left→right (+1), opponent drives right→left (-1)
  const dir = possession === _userSide ? 1 : -1;
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
