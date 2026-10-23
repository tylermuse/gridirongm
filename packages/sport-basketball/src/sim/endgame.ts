/**
 * End-of-game decisions for the final period (4th quarter and overtime).
 *
 * Without these the sim played the last two minutes like the first: no
 * intentional fouls, no clock management, no last shot — and it even ended
 * each quarter ~7 seconds early. Real NBA finishes are shaped by exactly these
 * choices, which is why ~6% of games reach overtime (the sim was at ~2-3%).
 *
 * Pure decision table + one RNG draw per call (kept here so the game loop and
 * tests share one source of truth).
 */

import type { Rng } from './rng';

export type EndgamePlan =
  /** Play it normally. */
  | { kind: 'normal' }
  /** Trailing defense fouls on purpose to stop the clock. */
  | { kind: 'foul' }
  /** Leading offense drains clock: possession uses at least `minSeconds`. */
  | { kind: 'hold'; minSeconds: number }
  /** Trailing offense hurries: possession takes `seconds`; maybe must shoot a three. */
  | { kind: 'hurry'; seconds: number; forceThree: boolean }
  /** Tie game: hold for the last shot; the possession consumes `seconds`. */
  | { kind: 'lastShot'; seconds: number }
  /** Under ~4 seconds: a rushed heave — far below normal make rates. */
  | { kind: 'heave'; forceThree: boolean };

/** Seconds left at which the trailing team starts fouling, by deficit. */
const FOUL_WINDOW: Record<number, number> = { 1: 24, 2: 24, 3: 12, 4: 30, 5: 40, 6: 48, 7: 55, 8: 60, 9: 65 };
/** Above this deficit late, fouling is pointless — the game is decided. */
const MAX_FOUL_DEFICIT = 9;

/**
 * @param offenseLead  offense score − defense score before the possession
 * @param secondsLeft  seconds left in the period
 * @param finalPeriod  4th quarter or any overtime
 */
export function endgamePlan(offenseLead: number, secondsLeft: number, finalPeriod: boolean, rng: Rng): EndgamePlan {
  if (!finalPeriod || secondsLeft > 75) return { kind: 'normal' };

  // A possession that starts with ≤4s left is a catch-and-heave, whoever has it.
  // (Without this, a missed last shot handed the other team a normal ~50% look
  // with two seconds left, which broke most ties before overtime.)
  if (secondsLeft <= 4 && offenseLead <= 0) {
    return { kind: 'heave', forceThree: offenseLead <= -3 };
  }

  // Defense is trailing → foul to extend the game (most teams, not all).
  if (offenseLead >= 1 && offenseLead <= MAX_FOUL_DEFICIT && secondsLeft <= FOUL_WINDOW[offenseLead]) {
    if (rng.chance(offenseLead <= 2 ? 0.75 : 0.9)) return { kind: 'foul' };
  }

  // Offense leads late → milk the shot clock.
  if (offenseLead >= 1 && secondsLeft <= 40) {
    return { kind: 'hold', minSeconds: Math.min(secondsLeft, 16 + rng.random() * 7) };
  }

  // Tie → hold for the last shot (a miss means overtime).
  if (offenseLead === 0 && secondsLeft <= 24) {
    return { kind: 'lastShot', seconds: Math.max(0, secondsLeft - (1 + rng.random() * 3)) };
  }

  // Offense trails late → quick shots, and a three when only a three ties it.
  if (offenseLead < 0 && secondsLeft <= 45) {
    const deficit = -offenseLead;
    const needThree =
      (deficit === 3 && secondsLeft <= 24) ||
      (deficit >= 4 && deficit <= 9 && rng.chance(0.55));
    return { kind: 'hurry', seconds: Math.min(secondsLeft, 4 + rng.random() * 6), forceThree: needThree };
  }

  return { kind: 'normal' };
}
