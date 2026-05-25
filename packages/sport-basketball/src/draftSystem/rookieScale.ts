/**
 * Rookie scale contract generator.
 *
 * NBA rookie scale (v1 model):
 *   - Round 1 picks (1-30): 4-year contracts. Years 1-2 guaranteed,
 *     years 3 and 4 are team options. Salaries scale exponentially
 *     by pick number; #1 overall ~5.5% of cap, #30 ~1.4% of cap.
 *     Annual raises follow standard NBA rookie scale (~6-8% per year).
 *   - Round 2 picks (31-60): 2-year contracts at the league minimum.
 *     In real NBA these are often two-way contracts or partially-
 *     guaranteed deals; v1 just uses guaranteed minimums for simplicity.
 *
 * v2 enhancements (not in v1):
 *   - 4th-year qualifying offer + restricted free agency mechanics
 *   - Rookie extension eligibility window (3rd year offseason)
 *   - 80%/100% guarantee gradient on round 2 deals
 *   - Two-way contract option for late round 2 picks
 */

import type { BaseContract, ContractYear } from '@bs/core/adapter';

/** Approximate league average salary cap in 2026. Pass actual cap to
 *  getRookieScaleContract() to drive percentages off the real number. */
export const DEFAULT_CAP_REFERENCE = 140_000_000;

/** Year-1 salary as percentage of the cap, indexed by pick number (1-30).
 *  Calibrated against the 2024-25 NBA rookie scale, scaled to fit cap
 *  percentages so it remains accurate as the cap grows. */
const R1_PCT_OF_CAP_BY_PICK: readonly number[] = [
  0.055, 0.049, 0.044, 0.040, 0.036, 0.033, 0.030, 0.028, 0.026, 0.024,
  0.023, 0.021, 0.020, 0.019, 0.018, 0.017, 0.016, 0.0155, 0.015, 0.0145,
  0.014, 0.0135, 0.0132, 0.0129, 0.0126, 0.0124, 0.0122, 0.0120, 0.0118, 0.0116,
];

/** Per-year raise compound rate for round 1 rookies (~7% per year). */
const R1_YEARLY_RAISE = 0.07;

/** Round 2 (picks 31-60): flat 2-year contracts at league minimum. */
const R2_MINIMUM_SALARY = 1_200_000;

// ===========================================================================
// Public API
// ===========================================================================

export interface RookieContractOptions {
  /** Salary cap for the signing season. Used to scale R1 picks.
   *  Default DEFAULT_CAP_REFERENCE. */
  capForSeason?: number;
  /** Year the contract begins (e.g., 2026 for the 2026-27 season). */
  signedSeason: number;
}

/**
 * Generate a rookie scale contract for the given overall pick number.
 *
 * @param overallPick 1-60 (1 = #1 overall, 60 = last pick of round 2)
 * @returns BaseContract with 4 years (R1) or 2 years (R2)
 */
export function rookieScaleContract(
  overallPick: number,
  opts: RookieContractOptions,
): BaseContract {
  if (overallPick < 1 || overallPick > 60) {
    throw new Error(`Rookie scale only defined for picks 1-60 (got ${overallPick})`);
  }
  const isRound1 = overallPick <= 30;
  const cap = opts.capForSeason ?? DEFAULT_CAP_REFERENCE;

  const years: ContractYear[] = [];
  let guaranteedTotal = 0;

  if (isRound1) {
    const year1Salary = Math.round(cap * R1_PCT_OF_CAP_BY_PICK[overallPick - 1]);
    let salary = year1Salary;
    for (let i = 0; i < 4; i++) {
      const guaranteed = i < 2; // first 2 years guaranteed, 3+4 are team options
      const seasonYear = opts.signedSeason + i;
      years.push({
        season: seasonYear,
        baseSalary: Math.round(salary),
        proratedBonus: 0,
        guaranteed,
      });
      if (guaranteed) guaranteedTotal += Math.round(salary);
      salary = salary * (1 + R1_YEARLY_RAISE);
    }
  } else {
    // Round 2: 2-year, both minimums, both guaranteed (v1 simplification)
    for (let i = 0; i < 2; i++) {
      years.push({
        season: opts.signedSeason + i,
        baseSalary: R2_MINIMUM_SALARY,
        proratedBonus: 0,
        guaranteed: true,
      });
      guaranteedTotal += R2_MINIMUM_SALARY;
    }
  }

  return {
    years,
    signedSeason: opts.signedSeason,
    guaranteedAtSigning: guaranteedTotal,
    modifications: [],
    sportData: {
      contractType: isRound1 ? 'rookie_scale_r1' : 'rookie_scale_r2',
      pickNumber: overallPick,
    },
  };
}
