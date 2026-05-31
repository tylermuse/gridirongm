/**
 * Shot selection + make probability model.
 *
 * Targets calibrated against 2024-25 NBA season averages:
 *   - Shot mix: ~42% threes, ~32% midrange/long-2, ~26% at-rim
 *   - FG%: ~47% overall (eFG% ~54%)
 *   - 3PT%: ~36%
 *   - Midrange/long-2: ~42%
 *   - At-rim: ~65%
 *   - FT%: ~78%
 *
 * Tuning approach: a 70-rated average player taking an uncontested shot
 * should hit at the league-average rate for that shot type. Higher ratings
 * + softer defenders push that up; lower ratings + tougher defenders push
 * it down. Pre-shot quality and shot type are independent — defender rating
 * affects make probability, doesn't (yet) push the offense into a different
 * shot type.
 *
 * Things this model intentionally doesn't simulate (v1 limitations):
 *   - Off-ball movement, screens, cuts (handled implicitly via ratings)
 *   - Spacing (every shot is independent)
 *   - Clutch / late-game state effects
 *   - Hot/cold streaks within a game
 *
 * Those are v2+ when we have more sim data and can calibrate the additions.
 */

import type { BasketballPosition, BasketballRatings } from '../types';
import type { Rng } from './rng';

export type ShotType = 'three' | 'midrange' | 'at_rim' | 'post';

export interface ShotResolution {
  type: ShotType;
  made: boolean;
  /** Was the shot heavily contested by the defender? Affects shooter's
   *  expectation and the rebound math (contested misses → long rebounds). */
  contested: boolean;
  /** Points awarded if made (2 or 3). */
  points: number;
  /** True if the shot drew a shooting foul → free throws. The shot itself
   *  is resolved separately above; if the shot was made, this is an
   *  and-1 (1 FT). If missed, full free throws. */
  drewShootingFoul: boolean;
}

// ---------------------------------------------------------------------------
// Shot type selection
// ---------------------------------------------------------------------------

/** Per-position baseline shot-type tendencies. Sum to 100 per row.
 *  These get modulated by the shooter's ratings:
 *  - A PG with high threePoint rating shifts toward more threes
 *  - A C with high postScoring rating shifts toward more post-ups
 *  Override examples: Steph Curry (PG with 95+ threePoint) shoots 60%+ threes;
 *  Nikola Jokic (C with elite postScoring + passing) shifts toward post + midrange. */
const BASE_SHOT_MIX: Record<BasketballPosition, Record<ShotType, number>> = {
  PG:  { three: 45, midrange: 25, at_rim: 25, post: 5 },
  SG:  { three: 50, midrange: 25, at_rim: 22, post: 3 },
  SF:  { three: 42, midrange: 25, at_rim: 28, post: 5 },
  PF:  { three: 32, midrange: 25, at_rim: 33, post: 10 },
  C:   { three: 15, midrange: 22, at_rim: 45, post: 18 },
};

export function selectShotType(
  shooterPosition: BasketballPosition,
  shooterRatings: BasketballRatings,
  rng: Rng,
  /** Game-plan three-point lean (1 = neutral). >1 perimeter, <1 inside. The
   *  weighted pick renormalizes, so biasing the 3 weight shifts the whole mix. */
  threeMult = 1,
  /** Coach-scheme post-up lean (1 = neutral). */
  postMult = 1,
): ShotType {
  const base = BASE_SHOT_MIX[shooterPosition];
  // Modulate weights by the shooter's rating in each shot category.
  // A shooter with elite (90+) threePoint rating shoots more threes than
  // the position baseline; a poor shooter (50) shoots fewer.
  const r = shooterRatings;
  const weights: Record<ShotType, number> = {
    three: base.three * ratingMultiplier(r.threePoint) * threeMult,
    midrange: base.midrange * ratingMultiplier(r.midRange),
    at_rim: base.at_rim * ratingMultiplier(r.finishing),
    post: base.post * ratingMultiplier(r.postScoring) * postMult,
  };
  return rng.pickWeighted(
    ['three', 'midrange', 'at_rim', 'post'] as const,
    [weights.three, weights.midrange, weights.at_rim, weights.post],
  );
}

/** Scales a base weight up/down by a rating's deviation from 70 (league avg).
 *  Rating 70 → 1.0× multiplier (no change).
 *  Rating 90 → ~1.4× (elite shooters shift mix toward their strength).
 *  Rating 50 → ~0.6× (poor shooters shift mix away from their weakness). */
function ratingMultiplier(rating: number): number {
  return 1 + (rating - 70) / 50;
}

// ---------------------------------------------------------------------------
// Make probability
// ---------------------------------------------------------------------------

/** League-average make rates by shot type. A 70-rated shooter vs a 70-rated
 *  defender hits at these rates on average. Calibrated to 2024-25 NBA.
 *
 *  Bumped slightly above raw NBA averages to compensate for the contested-shot
 *  penalty (which doesn't exist in the league-avg numbers — they already
 *  reflect contested shots) and small defender-rating effects. Sim runs at
 *  league-realistic 35-37% 3PT% with these constants. */
const LEAGUE_AVG_MAKE: Record<ShotType, number> = {
  three: 0.39,
  midrange: 0.44,
  at_rim: 0.67,
  post: 0.50,
};

/** How much a rating point above/below 70 shifts the make probability.
 *  +30 rating points (70 → 100) shifts +12% on shot make rate. */
const RATING_SHIFT_PER_POINT = 0.004;

/** How much the defender's relevant rating shifts the make probability the
 *  other direction. Defender effect is slightly weaker than shooter effect —
 *  good shooters generate good looks regardless. */
const DEFENDER_SHIFT_PER_POINT = 0.003;

export function makeProbability(
  shotType: ShotType,
  shooter: BasketballRatings,
  defender: BasketballRatings,
  contested: boolean,
): number {
  // Pick the shooter's relevant rating for this shot type
  const shooterRating = shooterRatingFor(shotType, shooter);
  // Pick the defender's relevant defensive rating
  const defenderRating = defenderRatingFor(shotType, defender);

  let p = LEAGUE_AVG_MAKE[shotType];
  p += (shooterRating - 70) * RATING_SHIFT_PER_POINT;
  p -= (defenderRating - 70) * DEFENDER_SHIFT_PER_POINT;

  // Contested shots are ~5% less likely to fall. (Was 8% in v0; reduced
   // because real-NBA league-avg make rates already include contested shots,
   // so an 8% penalty over-counts the defense effect.)
  if (contested) p -= 0.05;

  // Clamp to a sensible range — even Curry doesn't shoot 90% from three
  return clamp(p, 0.05, 0.92);
}

function shooterRatingFor(shot: ShotType, r: BasketballRatings): number {
  switch (shot) {
    case 'three': return r.threePoint;
    case 'midrange': return r.midRange;
    case 'at_rim': return r.finishing;
    case 'post': return r.postScoring;
  }
}

function defenderRatingFor(shot: ShotType, r: BasketballRatings): number {
  switch (shot) {
    case 'three':
    case 'midrange':
      return r.perimeterDefense;
    case 'at_rim':
    case 'post':
      // Interior defense + shot-blocking both bite at the rim
      return (r.interiorDefense + r.block) / 2;
  }
}

// ---------------------------------------------------------------------------
// Contest check
// ---------------------------------------------------------------------------

/** Whether the shot is contested. Better defenders contest more shots;
 *  off-ball movement (passing/awareness) gets shooters open more often.
 *  League average is ~45% of shots contested. */
export function isContested(
  shooter: BasketballRatings,
  defender: BasketballRatings,
  rng: Rng,
): boolean {
  const defenderQuality = (
    defender.perimeterDefense + defender.interiorDefense + defender.basketballIQ
  ) / 3;
  const shooterOpenness = (
    shooter.basketballIQ + shooter.passing + shooter.handles
  ) / 3;
  let p = 0.45 + (defenderQuality - 70) * 0.005 - (shooterOpenness - 70) * 0.003;
  p = clamp(p, 0.15, 0.85);
  return rng.chance(p);
}

// ---------------------------------------------------------------------------
// Shooting foul check
// ---------------------------------------------------------------------------

/** Probability of drawing a shooting foul. Higher at the rim, lower beyond
 *  the arc. Aggressive defenders foul more; skilled offensive players draw
 *  more (rip-throughs, ball-fakes). */
const SHOOTING_FOUL_BASE: Record<ShotType, number> = {
  at_rim: 0.18,
  post: 0.12,
  midrange: 0.04,
  three: 0.025,
};

export function drewShootingFoul(
  shotType: ShotType,
  shooter: BasketballRatings,
  defender: BasketballRatings,
  rng: Rng,
): boolean {
  let p = SHOOTING_FOUL_BASE[shotType];
  // Shooter craft (basketballIQ + handles) draws more fouls
  p += (shooter.basketballIQ - 70) * 0.0008;
  p += (shooter.handles - 70) * 0.0006;
  // Sloppy defender (low IQ relative to physicality) fouls more
  if (defender.basketballIQ < 65) p += 0.02;
  return rng.chance(clamp(p, 0.01, 0.4));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
