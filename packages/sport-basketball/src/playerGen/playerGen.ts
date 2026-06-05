/**
 * Basketball player generator.
 *
 * Produces realistic fictional players with position-appropriate ratings,
 * heights, wingspans, and ages.
 *
 * Mirrors the football playerGen pattern from apps/web/src/lib/engine/playerGen.ts
 * but with basketball-specific shape:
 *   - Heights matter much more (Cs ~82in / 6'10", PGs ~74in / 6'2")
 *   - Wingspan tracked separately (usually height + 2 to +6 inches)
 *   - Position-weighted ratings: PGs care about handles/passing/3PT,
 *     Cs care about interior defense/rebounding/finishing
 *   - Star tier derived from overall (superstar 95+, star 88-94, etc.)
 *
 * The generator hits a target overall rating by scaling individual ratings
 * up/down after the position-typical sample. This gives realistic spread
 * within a tier while letting callers ask for "give me a 92 OVR center"
 * for fixtures, draft classes, and roster building.
 */

import type { PlayerId } from '@bs/core/adapter';
import {
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballPlayerKind,
  type BasketballPlayerData,
  type BasketballRatings,
  BASKETBALL_POSITIONS,
  emptyBasketballStats,
} from '../types';
import { randomName } from './names';

// ===========================================================================
// Public API
// ===========================================================================

export interface BasketballPlayerGenOptions {
  /** Force a specific position. If omitted, picks based on the natural
   *  NBA distribution (slight bias toward wings + guards). */
  position?: BasketballPosition;
  /** Age in years. If omitted, picks from 19-35 weighted by realistic
   *  NBA age distribution (peaks around 25-28). */
  age?: number;
  /** Target overall rating (40-99 scale). Generator hits this within
   *  ±2. If omitted, samples from a roughly normal distribution centered
   *  on 70 (league average). */
  targetOverall?: number;
  /** Optional archetype hint within position. v1 supports simple
   *  archetypes; ignored for now if not relevant to position. */
  archetype?: PlayerArchetype;
  /** Optional override for the player ID. Useful for tests. */
  idOverride?: string;
  /** Random seed for reproducible generation. If omitted, uses
   *  Math.random(). For deterministic test fixtures, always pass. */
  rngSeed?: string;
}

export type PlayerArchetype =
  // Guard archetypes
  | 'scoring_pg' | 'pure_pg' | 'combo_guard' | '3_and_d_wing'
  // Wing archetypes
  | 'wing_scorer' | 'slasher' | 'stretch_4'
  // Big archetypes
  | 'post_threat' | 'rim_protector' | 'stretch_5';

/** Generate a single basketball player. */
export function generateBasketballPlayer(opts: BasketballPlayerGenOptions = {}): BasketballPlayer {
  const position = opts.position ?? pickPositionByDistribution();
  const age = opts.age ?? pickAgeByDistribution();
  const targetOvr = opts.targetOverall ?? sampleOverallNormal();
  const name = randomName();

  // Generate raw ratings from position template + variance
  let ratings = generateRatingsForPosition(position, targetOvr);

  // Compute actual OVR from individual ratings
  let actualOvr = computeOverall(ratings, position);

  // If we missed the target by more than ±2, scale ratings to hit it.
  // (Position weights mean that even after sampling around targetOvr,
  // the computed OVR can drift up or down.)
  if (Math.abs(actualOvr - targetOvr) > 2) {
    const shift = targetOvr - actualOvr;
    ratings = shiftRatings(ratings, shift);
    actualOvr = computeOverall(ratings, position);
  }
  ratings.overall = actualOvr;

  // Height + wingspan
  const height = generateHeight(position);
  ratings.height = height;
  ratings.wingspan = generateWingspan(height);

  // Derive star tier from overall
  const starTier = deriveStarTier(actualOvr);

  // Years in league based on age (NBA draft eligibility = 19; rookies have 0)
  const yearsInLeague = Math.max(0, age - 19);

  const sportData: BasketballPlayerData = {
    position,
    starTier,
    yearsInLeague,
    birdRights: 'none',
    isTwoWay: false,
    shootingHand: Math.random() < 0.1 ? 'left' : 'right',
  };

  const playerId = (opts.idOverride ?? generatePlayerId()) as PlayerId;

  return {
    id: playerId,
    firstName: name.firstName,
    lastName: name.lastName,
    birthDate: birthDateFromAge(age),
    age,
    nationality: pickNationality(),
    kind: 'standard' as BasketballPlayerKind,
    ratings,
    seasonStats: emptyBasketballStats(),
    careerStats: emptyBasketballStats(),
    contract: null,
    rosterSlot: null,
    injury: null,
    development: {
      potential: Math.min(99, actualOvr + Math.round(rollPotentialGap(age))),
      currentTrajectory: 'plateau',
      seasonsAtCurrentTrajectory: 1,
    },
    sportData,
  };
}

// ===========================================================================
// Position-specific rating templates
// ===========================================================================

/** Per-position baseline rating means. Each rating has a mean for that
 *  position; the actual sample is `mean + gaussian(0, stdDev)`. */
type RatingMeans = Record<keyof Omit<BasketballRatings, 'overall' | 'height' | 'wingspan'>, number>;

const POSITION_RATING_MEANS: Record<BasketballPosition, RatingMeans> = {
  PG: {
    speed: 78, strength: 65, vertical: 73,
    threePoint: 72, midRange: 70, finishing: 68, freeThrow: 78,
    postScoring: 50, handles: 82, passing: 78,
    perimeterDefense: 72, interiorDefense: 55, rebounding: 50,
    steal: 70, block: 45,
    basketballIQ: 72, intangibles: 70,
  },
  SG: {
    speed: 76, strength: 70, vertical: 75,
    threePoint: 75, midRange: 72, finishing: 70, freeThrow: 78,
    postScoring: 55, handles: 76, passing: 68,
    perimeterDefense: 72, interiorDefense: 58, rebounding: 55,
    steal: 68, block: 50,
    basketballIQ: 70, intangibles: 70,
  },
  SF: {
    speed: 73, strength: 73, vertical: 76,
    threePoint: 72, midRange: 70, finishing: 73, freeThrow: 75,
    postScoring: 60, handles: 70, passing: 67,
    perimeterDefense: 70, interiorDefense: 65, rebounding: 65,
    steal: 65, block: 58,
    basketballIQ: 70, intangibles: 70,
  },
  PF: {
    speed: 68, strength: 78, vertical: 74,
    threePoint: 65, midRange: 68, finishing: 76, freeThrow: 72,
    postScoring: 70, handles: 60, passing: 60,
    perimeterDefense: 62, interiorDefense: 74, rebounding: 76,
    steal: 60, block: 68,
    basketballIQ: 70, intangibles: 70,
  },
  C: {
    speed: 62, strength: 82, vertical: 70,
    threePoint: 55, midRange: 62, finishing: 80, freeThrow: 68,
    postScoring: 75, handles: 52, passing: 58,
    perimeterDefense: 58, interiorDefense: 80, rebounding: 80,
    steal: 55, block: 75,
    basketballIQ: 70, intangibles: 70,
  },
};

/** Standard deviation for rating sampling. Higher SD = more variance. */
const RATING_STD_DEV = 8;

function generateRatingsForPosition(
  position: BasketballPosition,
  targetOvr: number,
): BasketballRatings {
  const means = POSITION_RATING_MEANS[position];
  // Shift means up/down based on target overall vs league avg (70)
  const ovrShift = targetOvr - 70;

  const sample = (mean: number) => {
    const value = mean + ovrShift + gaussian(0, RATING_STD_DEV);
    return clamp(Math.round(value), 25, 99);
  };

  return {
    overall: 0, // filled in later
    height: 0, // filled in by caller
    wingspan: 0, // filled in by caller
    speed: sample(means.speed),
    strength: sample(means.strength),
    vertical: sample(means.vertical),
    threePoint: sample(means.threePoint),
    midRange: sample(means.midRange),
    finishing: sample(means.finishing),
    freeThrow: sample(means.freeThrow),
    postScoring: sample(means.postScoring),
    handles: sample(means.handles),
    passing: sample(means.passing),
    perimeterDefense: sample(means.perimeterDefense),
    interiorDefense: sample(means.interiorDefense),
    rebounding: sample(means.rebounding),
    steal: sample(means.steal),
    block: sample(means.block),
    basketballIQ: sample(means.basketballIQ),
    intangibles: sample(means.intangibles),
  };
}

// ===========================================================================
// Overall computation (position-weighted)
// ===========================================================================

/** Rating weights per position — higher weight = more important for OVR. */
const POSITION_OVR_WEIGHTS: Record<BasketballPosition, Partial<Record<keyof BasketballRatings, number>>> = {
  PG: { handles: 3, passing: 3, threePoint: 2, basketballIQ: 2, perimeterDefense: 2, speed: 1, finishing: 1 },
  SG: { threePoint: 3, finishing: 2, midRange: 2, handles: 2, perimeterDefense: 2, speed: 1, basketballIQ: 1 },
  SF: { threePoint: 2, finishing: 2, perimeterDefense: 2, rebounding: 1, handles: 1, basketballIQ: 2, intangibles: 1 },
  PF: { finishing: 2, rebounding: 3, interiorDefense: 2, threePoint: 1, postScoring: 2, strength: 1, block: 1 },
  C:  { finishing: 2, rebounding: 3, interiorDefense: 3, block: 2, postScoring: 2, strength: 1 },
};

const ALL_RATING_KEYS_FOR_OVR: (keyof BasketballRatings)[] = [
  'speed', 'strength', 'vertical',
  'threePoint', 'midRange', 'finishing', 'freeThrow', 'postScoring',
  'handles', 'passing',
  'perimeterDefense', 'interiorDefense', 'rebounding', 'steal', 'block',
  'basketballIQ', 'intangibles',
];

export function computeOverall(ratings: BasketballRatings, position: BasketballPosition): number {
  const weights = POSITION_OVR_WEIGHTS[position];
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of ALL_RATING_KEYS_FOR_OVR) {
    const w = weights[key] ?? 0.3; // ratings not in weights still contribute a little
    weightedSum += (ratings[key] as number) * w;
    totalWeight += w;
  }
  return clamp(Math.round(weightedSum / totalWeight), 40, 99);
}

// ===========================================================================
// Helpers
// ===========================================================================

function shiftRatings(ratings: BasketballRatings, shift: number): BasketballRatings {
  return {
    ...ratings,
    speed: clamp(ratings.speed + shift, 25, 99),
    strength: clamp(ratings.strength + shift, 25, 99),
    vertical: clamp(ratings.vertical + shift, 25, 99),
    threePoint: clamp(ratings.threePoint + shift, 25, 99),
    midRange: clamp(ratings.midRange + shift, 25, 99),
    finishing: clamp(ratings.finishing + shift, 25, 99),
    freeThrow: clamp(ratings.freeThrow + shift, 25, 99),
    postScoring: clamp(ratings.postScoring + shift, 25, 99),
    handles: clamp(ratings.handles + shift, 25, 99),
    passing: clamp(ratings.passing + shift, 25, 99),
    perimeterDefense: clamp(ratings.perimeterDefense + shift, 25, 99),
    interiorDefense: clamp(ratings.interiorDefense + shift, 25, 99),
    rebounding: clamp(ratings.rebounding + shift, 25, 99),
    steal: clamp(ratings.steal + shift, 25, 99),
    block: clamp(ratings.block + shift, 25, 99),
    basketballIQ: clamp(ratings.basketballIQ + shift, 25, 99),
    intangibles: clamp(ratings.intangibles + shift, 25, 99),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, n)));
}

/** Box-Muller normal sampling. */
function gaussian(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
}

/** Position distribution roughly mirrors NBA roster composition.
 *  Slight bias toward wings (SF) and guards. */
function pickPositionByDistribution(): BasketballPosition {
  const weights = { PG: 22, SG: 22, SF: 22, PF: 18, C: 16 };
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const pos of BASKETBALL_POSITIONS) {
    r -= weights[pos];
    if (r <= 0) return pos;
  }
  return 'SF';
}

/** Age distribution — peaks around 25-28, tails toward 19 (rookies) and 35 (vets). */
function pickAgeByDistribution(): number {
  // Realistic NBA age distribution. Sample then clamp 19-40.
  const age = Math.round(gaussian(26, 4));
  return Math.max(19, Math.min(40, age));
}

/** Overall rating distribution — most players cluster 65-75, with a long
 *  tail for stars. */
function sampleOverallNormal(): number {
  const sample = gaussian(70, 7);
  return clamp(Math.round(sample), 50, 95);
}

function deriveStarTier(overall: number): BasketballPlayerData['starTier'] {
  if (overall >= 95) return 'superstar';
  if (overall >= 88) return 'star';
  if (overall >= 80) return 'starter';
  if (overall >= 73) return 'role';
  return 'bench';
}

/** Height in inches, position-typical. NBA averages by position:
 *  PG ~74in (6'2"), SG ~77in (6'5"), SF ~79in (6'7"),
 *  PF ~81in (6'9"), C ~82in (6'10"). */
const POSITION_HEIGHT_MEANS: Record<BasketballPosition, number> = {
  PG: 74, SG: 77, SF: 80, PF: 82, C: 84,
};
const HEIGHT_STD_DEV = 1.5;

function generateHeight(position: BasketballPosition): number {
  const mean = POSITION_HEIGHT_MEANS[position];
  const h = Math.round(gaussian(mean, HEIGHT_STD_DEV));
  return Math.max(68, Math.min(91, h));
}

/** Wingspan in inches. Usually height + 2 to +6, with elite defenders
 *  having +8 or more. */
function generateWingspan(height: number): number {
  const diff = Math.round(2 + gaussian(2, 1.5));
  return Math.max(height - 1, height + diff);
}

/** Higher potential gap for younger players (more room to grow). Returns
 *  a value 0-15 to add to current OVR for the player's potential. */
function rollPotentialGap(age: number): number {
  if (age >= 30) return Math.max(0, gaussian(1, 1));
  if (age >= 27) return Math.max(0, gaussian(3, 2));
  if (age >= 24) return Math.max(0, gaussian(5, 3));
  if (age >= 21) return Math.max(0, gaussian(8, 3));
  return Math.max(0, gaussian(12, 4));
}

function pickNationality(): string {
  // NBA is ~78% US, ~22% international. Reflect that distribution.
  if (Math.random() < 0.78) return 'US';
  const intl = ['CA', 'FR', 'AU', 'SR', 'ES', 'GR', 'LT', 'DE', 'GB', 'NG', 'CM', 'TR', 'IT', 'CZ', 'CN', 'LV', 'RS'];
  return intl[Math.floor(Math.random() * intl.length)];
}

function birthDateFromAge(age: number): string {
  // Approximate: assume current "season year" is some recent year. Use
  // simple subtract-from-now. This is just for display; the engine uses
  // age, not birthDate, for game logic.
  const today = new Date();
  const birthYear = today.getFullYear() - age;
  // Random month/day (1-28 to avoid month-end edge cases)
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;
  return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

let nextPlayerIdCounter = 0;
function generatePlayerId(): string {
  return `bball-p-${Date.now()}-${nextPlayerIdCounter++}`;
}

// ===========================================================================
// Draft class generation
// ===========================================================================

/** Generate a draft class of N prospects.
 *
 *  Rookies enter RAW: a low current overall now, with the upside (potential)
 *  concentrated near the top of the board. The array index is the scouting
 *  rank (best prospect first), so best-available drafting maps the top of the
 *  board to the top picks. Rough shape across the two rounds:
 *   - Top of round 1: ~64-71 OVR now, projecting to 88-99 (future stars)
 *   - Late round 1:   ~55-62 OVR now, projecting to low-70s/80 (starters)
 *   - Round 2:        ~46-60 OVR now, modest upside (projects / fringe)
 *
 *  Previously every prospect was generated at its *projection* as a current
 *  overall, so second-rounders came out as finished 80-OVR players. Now current
 *  overall and potential both taper down the board.
 *
 *  All prospects are age 19 (basketball eligibility minimum). */
export function generateBasketballDraftClass(_season: number, count = 60): BasketballPlayer[] {
  // _season is unused in v1 — future enhancement could vary class strength
  // by year (some drafts are deeper than others, mirroring real NBA cycles).
  const prospects: BasketballPlayer[] = [];
  for (let rank = 0; rank < count; rank++) {
    // Current overall declines down the board (round 1 ≈ ranks 0-29).
    const ovrBase = rank < 30
      ? 68 - (rank * (68 - 58)) / 29        // R1: 68 → 58
      : 57 - ((rank - 30) * (57 - 46)) / 29; // R2: 57 → 46
    const targetOvr = clamp(Math.round(ovrBase + gaussian(0, 3)), 42, 75);
    const p = generateBasketballPlayer({ age: 19, targetOverall: targetOvr });

    // Upside tapers too: a top-3 pick can project to a star, a late
    // second-rounder is mostly a finished, fringe product.
    const upsideBase = rank < 30
      ? 22 - (rank * (22 - 6)) / 29         // R1: +22 → +6
      : 5 - ((rank - 30) * (5 - 1)) / 29;   // R2: +5 → +1
    const gap = Math.max(0, Math.round(upsideBase + gaussian(0, 3)));
    const potential = Math.min(99, p.ratings.overall + gap);

    prospects.push({ ...p, development: { ...p.development, potential } });
  }
  return prospects;
}
