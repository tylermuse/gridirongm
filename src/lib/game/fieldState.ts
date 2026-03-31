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

/** Convert "yards from possessing team's endzone" to absolute yard (0=away EZ, 100=home EZ) */
function toAbsoluteYard(fieldPos: number, possession: 'home' | 'away'): number {
  // Home offense goes left-to-right: fieldPos 0 = yard 0, fieldPos 100 = yard 100
  // Away offense goes right-to-left: fieldPos 0 = yard 100, fieldPos 100 = yard 0
  if (possession === 'home') return fieldPos;
  return 100 - fieldPos;
}

/** Place formation dots relative to an absolute scrimmage yard */
function placeDots(
  formation: DotPosition[],
  scrimmageAbsYard: number,
  possession: 'home' | 'away',
  role: 'offense' | 'defense',
): DotState[] {
  // Offense behind LOS, defense in front. Direction depends on possession.
  // Home attacks right (+), Away attacks left (-)
  const dir = possession === 'home' ? 1 : -1;
  const offenseDir = role === 'offense' ? -1 : 1; // offense is behind LOS, defense in front

  return formation.map(dot => {
    const absYard = clamp(
      scrimmageAbsYard + dot.yardOffset * dir * offenseDir,
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
  const dir = possession === 'home' ? 1 : -1;
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
