/**
 * Free-agent market salary model.
 *
 * Given a player's overall rating, age, position, and league cap, estimate
 * what they'd ask for in free agency. Used by:
 *   - Negotiation engine (player's starting ask)
 *   - Trade evaluator (player value normalization)
 *   - UI hint on the FA board ("market: $18M/yr")
 *
 * Model: piecewise function of OVR with age-curve + position-scarcity
 * multipliers, anchored to known NBA reference points.
 *
 * Anchors (2024-25 NBA, % of cap):
 *   - 95+ OVR (Jokic/Luka/SGA): 25-35% of cap (capped by max-salary tier)
 *   - 88-94 OVR (All-Stars):    18-26%
 *   - 82-87 OVR (All-Star bench / borderline): 12-18%
 *   - 76-81 OVR (rotation starters):           7-12%
 *   - 70-75 OVR (solid rotation / 6th men):    4-7%
 *   - 65-69 OVR (deep bench / fringe):         min-2M to 4M
 *   - <65 OVR:                                 league min
 *
 * v1 simplifications:
 *   - No supply/demand modeling (if every team needs a center, all centers
 *     get a premium). v2 should price scarcity.
 *   - No "team fit" effect (3-and-D wings get a premium from contenders).
 *   - No max-salary tier enforcement at the top (caller layers via cap rules).
 */

import type { BasketballPlayer, BasketballPosition } from '../types';
import { basketballSalaryCap, LEAGUE_MINIMUM_SALARY } from './capRules';

// ===========================================================================
// Position scarcity multipliers
// ===========================================================================

/** NBA positional value, v1 approximation. Wings + centers are scarcer
 *  than guards across the league; PFs are most fungible. */
const POSITION_VALUE_MULT: Record<BasketballPosition, number> = {
  PG: 1.00,
  SG: 0.95,
  SF: 1.05, // wings are scarce
  PF: 0.98,
  C: 1.08, // bigs are scarce
};

// ===========================================================================
// Age curve
// ===========================================================================

/** Age multiplier — what fraction of "peak value" a player commands at age X.
 *  Peak is 26-28. Drops on either side; older players get shorter / smaller
 *  deals. */
function ageValueMultiplier(age: number): number {
  if (age <= 21) return 0.85; // rookie deals, untested
  if (age <= 24) return 0.95;
  if (age <= 28) return 1.00; // peak
  if (age <= 31) return 0.92;
  if (age <= 34) return 0.78;
  if (age <= 37) return 0.55;
  return 0.35;
}

// ===========================================================================
// OVR → % of cap (piecewise)
// ===========================================================================

function basePctOfCap(ovr: number): number {
  // % of the salary cap, calibrated to real NBA contracts (max = 25/30/35% of cap
  // by service time; All-NBA stars land ~30%, quality starters ~12-18%, rotation
  // ~6-12%, role ~MLE, fringe near the minimum). The prior curve was compressed
  // low — an All-NBA player came out ~$31M instead of ~$42M — so teams could fit
  // far too much talent under the cap and never faced pressure to let anyone go.
  if (ovr >= 94) return 0.36;  // supermax / generational
  if (ovr >= 91) return 0.33;  // max
  if (ovr >= 88) return 0.30;  // All-NBA
  if (ovr >= 85) return 0.255; // All-Star
  if (ovr >= 82) return 0.205; // high-end starter — was 0.18, which made every
                               // star read as "overpaid" vs. their real max
                               // deal and cratered their trade value.
  if (ovr >= 80) return 0.155; // solid starter
  if (ovr >= 78) return 0.115; // starter
  if (ovr >= 76) return 0.09;  // sixth man / full MLE
  if (ovr >= 74) return 0.065; // rotation
  if (ovr >= 72) return 0.045; // role player
  if (ovr >= 70) return 0.03;  // fringe rotation
  if (ovr >= 67) return 0.018; // deep bench
  return 0.012;                // around league minimum
}

// ===========================================================================
// Public API
// ===========================================================================

export interface MarketSalaryOptions {
  /** Season the contract would start. Drives the cap basis. Default current
   *  season per the player's contract (or 2026 if neither available). */
  season?: number;
  /** Random noise multiplier — adds ±5% to the estimate by default so two
   *  FAs with identical ratings don't get identical asks. Pass 0 to disable
   *  for deterministic tests. */
  noiseSeed?: string;
}

/**
 * Estimate the player's starting market salary in $/year.
 *
 * Note: This is the player's *ask*, not what they'll necessarily sign for.
 * The negotiation engine layers team interest, cap room, and counter-offers
 * on top to reach the actual signing.
 */
export function basketballMarketSalary(
  player: BasketballPlayer,
  opts: MarketSalaryOptions = {},
): number {
  const season = opts.season ?? 2026;
  const cap = basketballSalaryCap(season);
  const ovr = player.ratings.overall;
  const age = player.age;
  const pos = player.sportData.position;

  const pct = basePctOfCap(ovr);
  const ageMult = ageValueMultiplier(age);
  const posMult = POSITION_VALUE_MULT[pos];

  const raw = cap * pct * ageMult * posMult;

  // Noise — ±5% by default
  const noise = opts.noiseSeed ? noiseFactor(opts.noiseSeed) : 1.0;
  const withNoise = raw * noise;

  // Clamp to league minimum on the low end
  const final = Math.max(LEAGUE_MINIMUM_SALARY, Math.round(withNoise / 100_000) * 100_000);
  return final;
}

/**
 * Estimate the expected contract length the player wants.
 * Stars + young players want max term; vets get shorter deals;
 * fringe players take what they can get.
 */
export function basketballMarketContractYears(player: BasketballPlayer): number {
  const ovr = player.ratings.overall;
  const age = player.age;
  // Stars want max length (capped at 5 by cap rules)
  if (ovr >= 88) return age >= 33 ? 3 : age >= 30 ? 4 : 5;
  if (ovr >= 80) return age >= 32 ? 2 : age >= 28 ? 3 : 4;
  if (ovr >= 73) return age >= 32 ? 1 : age >= 28 ? 2 : 3;
  // Fringe players: 1-year prove-it deals
  return age >= 30 ? 1 : 2;
}

// ===========================================================================
// Deterministic small-noise helper
// ===========================================================================

/** Produce a multiplier in [0.95, 1.05] from a string seed. */
function noiseFactor(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) / 4294967296);
  return 0.95 + u * 0.10;
}
