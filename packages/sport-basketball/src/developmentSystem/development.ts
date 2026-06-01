/**
 * Basketball player development system.
 *
 * Models multi-season aging: how a player's ratings change year-over-year.
 *
 * NBA-realistic aging curve:
 *   - 19-22: Steep rise. Rookies developing into rotation players. +2-5 OVR/year possible.
 *   - 23-25: Continued growth approaching peak. +1-3 OVR/year average.
 *   - 26-28: Peak years, mostly flat. -1 to +1 OVR/year.
 *   - 29-31: Subtle decline begins. -1 to -2 OVR/year.
 *   - 32-34: Decline accelerates. -1 to -3 OVR/year.
 *   - 35+:   Steep decline, except for elite skill players. -2 to -4 OVR/year.
 *
 * Differential rating decline:
 *   - Athletic ratings (speed, vertical) decline first and fastest
 *   - Skill ratings (3PT, FT, basketballIQ) hold longer
 *   - Defense tracks roughly with age (mix of athletic + skill)
 *
 * v1 simplifications:
 *   - No injury history effect on aging
 *   - No system fit / coach quality effects
 *   - No offseason training mode
 *   - Mid-season ticks are no-op
 */

import type { BasketballPlayer, BasketballRatings, BasketballPosition } from '../types';

// ===========================================================================
// Aging curve tunables
// ===========================================================================

function expectedDriftForAge(age: number): number {
  if (age <= 21) return 3.5;
  if (age <= 23) return 2.0;
  if (age <= 25) return 1.0;
  if (age <= 28) return 0.0;
  if (age <= 31) return -1.2;
  if (age <= 34) return -2.2;
  if (age <= 37) return -3.0;
  return -3.5;
}

function driftStdForAge(age: number): number {
  if (age <= 22) return 2.5;
  if (age <= 28) return 1.5;
  return 1.8;
}

// ===========================================================================
// Public API
// ===========================================================================

export interface DevelopSeasonOptions {
  /** RNG seed for reproducibility. Default: derived from player ID + season. */
  rngSeed?: string;
  /**
   * Multiplier applied to POSITIVE year-over-year drift (i.e. a young player's
   * growth), e.g. from a player-development coach. 1.0 = neutral (default);
   * >1 accelerates improvement. Never penalizes decline, so it only ever helps
   * rising players. Omitting it reproduces the un-coached aging curve exactly.
   */
  developmentMultiplier?: number;
}

/**
 * Apply a season of aging + development. Returns a NEW player object —
 * does not mutate the input. Called at offseason rollover.
 */
export function developBasketballPlayer(
  player: BasketballPlayer,
  season: number,
  opts: DevelopSeasonOptions = {},
): BasketballPlayer {
  const rng = makeRng(opts.rngSeed ?? `${player.id}-${season}`);
  const newAge = player.age + 1;

  const expected = expectedDriftForAge(newAge);
  const std = driftStdForAge(newAge);
  const raw = expected + gaussian(0, std, rng);
  // A development coach only accelerates upward drift; decline is unaffected.
  // mult === 1 leaves the expression identical to the un-coached path.
  const mult = opts.developmentMultiplier ?? 1;
  const drift = Math.round(mult !== 1 && raw > 0 ? raw * mult : raw);

  const newRatings = applyAgingToRatings(player.ratings, newAge, drift, rng);
  const newOverall = approximateOverall(newRatings, player.sportData.position);
  newRatings.overall = newOverall;

  const newTrajectory = computeTrajectory(drift, newAge, player.development.currentTrajectory);
  const trajectorySeasons = newTrajectory === player.development.currentTrajectory
    ? player.development.seasonsAtCurrentTrajectory + 1
    : 1;

  const newPotential = updatePotential(
    player.development.potential,
    newOverall,
    newAge,
    rng,
  );

  return {
    ...player,
    age: newAge,
    ratings: newRatings,
    development: {
      potential: newPotential,
      currentTrajectory: newTrajectory,
      seasonsAtCurrentTrajectory: trajectorySeasons,
    },
    sportData: {
      ...player.sportData,
      yearsInLeague: (player.sportData as { yearsInLeague: number }).yearsInLeague + 1,
    },
  };
}

/**
 * Whether the player retires this offseason.
 *   - age >= 40 always retires
 *   - age >= 35 AND OVR < 60 retires
 *   - age >= 33 AND OVR < 55 retires
 *   - voluntary retirement chance for declining mid-tier vets
 */
export function shouldBasketballPlayerRetire(
  player: BasketballPlayer,
  opts: DevelopSeasonOptions = {},
): boolean {
  const rng = makeRng(opts.rngSeed ?? `retire-${player.id}-${player.age}`);
  const age = player.age;
  const ovr = player.ratings.overall;

  if (age >= 40) return true;
  if (age >= 35 && ovr < 60) return true;
  if (age >= 33 && ovr < 55) return true;

  if (age >= 35 && ovr < 75 && rng.random() < 0.15) return true;
  if (age >= 37 && ovr < 80 && rng.random() < 0.25) return true;

  return false;
}

/** Mid-season per-tick player update. v1: no-op. */
export function tickBasketballPlayer(
  player: BasketballPlayer,
  _ticksAdvanced: number,
): BasketballPlayer {
  return player;
}

// ===========================================================================
// Rating-aging math
// ===========================================================================

function applyAgingToRatings(
  ratings: BasketballRatings,
  newAge: number,
  ovrDrift: number,
  rng: SimpleRng,
): BasketballRatings {
  const athleticBias = newAge >= 30 ? 1.4 : newAge <= 22 ? 1.2 : 1.0;
  const skillBias = newAge >= 30 ? 0.6 : 1.0;
  const defenseBias = 1.0;

  const out: BasketballRatings = { ...ratings };

  // Athletic
  out.speed = shiftRating(ratings.speed, ovrDrift * athleticBias, rng);
  out.strength = shiftRating(ratings.strength, ovrDrift * (newAge >= 30 ? 0.8 : 1.0), rng);
  out.vertical = shiftRating(ratings.vertical, ovrDrift * athleticBias, rng);

  // Offense — skills hold longer
  out.threePoint = shiftRating(ratings.threePoint, ovrDrift * skillBias, rng);
  out.midRange = shiftRating(ratings.midRange, ovrDrift * skillBias, rng);
  out.finishing = shiftRating(ratings.finishing, ovrDrift * (newAge >= 30 ? 0.8 : 1.0), rng);
  out.freeThrow = shiftRating(ratings.freeThrow, ovrDrift * 0.4, rng);
  out.postScoring = shiftRating(ratings.postScoring, ovrDrift * (newAge >= 30 ? 0.7 : 1.0), rng);
  out.handles = shiftRating(ratings.handles, ovrDrift * skillBias, rng);
  out.passing = shiftRating(ratings.passing, ovrDrift * 0.5, rng);

  // Defense
  out.perimeterDefense = shiftRating(ratings.perimeterDefense, ovrDrift * defenseBias, rng);
  out.interiorDefense = shiftRating(ratings.interiorDefense, ovrDrift * defenseBias, rng);
  out.rebounding = shiftRating(ratings.rebounding, ovrDrift * defenseBias, rng);
  out.steal = shiftRating(ratings.steal, ovrDrift * defenseBias, rng);
  out.block = shiftRating(ratings.block, ovrDrift * (newAge >= 30 ? 1.2 : 1.0), rng);

  // Mental — IQ grows slightly for vets in their late 20s/early 30s
  if (newAge >= 24 && newAge <= 33) {
    out.basketballIQ = shiftRating(ratings.basketballIQ, Math.max(0, 0.3 + rng.random() * 0.5), rng);
  } else {
    out.basketballIQ = shiftRating(ratings.basketballIQ, ovrDrift * 0.3, rng);
  }
  out.intangibles = shiftRating(ratings.intangibles, ovrDrift * 0.3, rng);

  return out;
}

function shiftRating(value: number, drift: number, rng: SimpleRng): number {
  const noise = (rng.random() - 0.5) * 2.5;
  return clamp(Math.round(value + drift + noise), 25, 99);
}

const POSITION_OVR_WEIGHTS: Record<BasketballPosition, Partial<Record<keyof BasketballRatings, number>>> = {
  PG: { handles: 3, passing: 3, threePoint: 2, basketballIQ: 2, perimeterDefense: 2, speed: 1, finishing: 1 },
  SG: { threePoint: 3, finishing: 2, midRange: 2, handles: 2, perimeterDefense: 2, speed: 1, basketballIQ: 1 },
  SF: { threePoint: 2, finishing: 2, perimeterDefense: 2, rebounding: 1, handles: 1, basketballIQ: 2, intangibles: 1 },
  PF: { finishing: 2, rebounding: 3, interiorDefense: 2, threePoint: 1, postScoring: 2, strength: 1, block: 1 },
  C:  { finishing: 2, rebounding: 3, interiorDefense: 3, block: 2, postScoring: 2, strength: 1 },
};

const ALL_RATING_KEYS: (keyof BasketballRatings)[] = [
  'speed', 'strength', 'vertical',
  'threePoint', 'midRange', 'finishing', 'freeThrow', 'postScoring',
  'handles', 'passing',
  'perimeterDefense', 'interiorDefense', 'rebounding', 'steal', 'block',
  'basketballIQ', 'intangibles',
];

/** Inlined OVR computation — same formula as playerGen's, kept here
 *  to avoid a circular import. */
function approximateOverall(r: BasketballRatings, position: BasketballPosition): number {
  const weights = POSITION_OVR_WEIGHTS[position] ?? {};
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of ALL_RATING_KEYS) {
    const w: number = weights[key] ?? 0.3;
    weightedSum += (r[key] as number) * w;
    totalWeight += w;
  }
  return clamp(Math.round(weightedSum / totalWeight), 40, 99);
}

function computeTrajectory(
  drift: number,
  age: number,
  current: BasketballPlayer['development']['currentTrajectory'],
): BasketballPlayer['development']['currentTrajectory'] {
  if (drift >= 5) return 'breakout';
  if (drift >= 2) return 'rising';
  if (drift <= -4) return 'cliff';
  if (drift <= -2) return 'declining';
  if (age >= 32 && current === 'declining') return 'declining';
  return 'plateau';
}

function updatePotential(
  currentPotential: number,
  newOverall: number,
  age: number,
  rng: SimpleRng,
): number {
  let gap: number;
  if (age <= 21) gap = Math.max(0, 10 + gaussian(0, 3, rng));
  else if (age <= 24) gap = Math.max(0, 5 + gaussian(0, 2, rng));
  else if (age <= 27) gap = Math.max(0, 2 + gaussian(0, 1.5, rng));
  else gap = Math.max(0, gaussian(0, 1, rng));

  const newCeiling = Math.min(99, newOverall + Math.round(gap));
  return Math.max(newOverall, Math.min(currentPotential, newCeiling));
}

// ===========================================================================
// Tiny RNG
// ===========================================================================

interface SimpleRng {
  random(): number;
}

function makeRng(seed: string): SimpleRng {
  let s = hashString(seed);
  return {
    random(): number {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gaussian(mean: number, stdDev: number, rng: SimpleRng): number {
  const u1 = rng.random();
  const u2 = rng.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
}

function clamp(n: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, n)));
}
