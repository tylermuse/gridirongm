/**
 * Shared salary estimation logic.
 * Extracted to its own module to avoid circular dependencies between store.ts and playerGen.ts.
 */
import type { Position, SubPosition } from '@/types';
import { DEFAULT_LEAGUE_SETTINGS } from '@/types';

export const LEAGUE_MINIMUM_SALARY = DEFAULT_LEAGUE_SETTINGS.leagueMinSalary;

// Position ceiling multipliers — tuned against 2025-26 NFL top-5 APY data:
//   QB (~$55M) > WR/EDGE (~$40M) > OT/DT (~$28M) > CB (~$22M) >
//   LB/S/TE/iOL (~$18-20M) > RB (~$18M, custom curve) > K/P (~$4M/$2.5M hard cap).
// Community feedback (tofftanaut, Apr 16): LBs asking $40M+ was breaking
// immersion — these multipliers cap that behavior at the top end while
// preserving the base OVR curve for mid/low tier asks.
const POSITION_SALARY_MULTIPLIER: Partial<Record<Position, number>> = {
  QB: 1.15,
  WR: 0.85,
  DL: 0.75,
  OL: 0.55,
  CB: 0.45,
  TE: 0.45,
  LB: 0.40,
  S: 0.40,
  RB: 0.65,
  K: 0.15,
  P: 0.12,
};

/** Hard ceilings (per-year, before cap inflation) by position. Calibrated
 *  against 2025–26 NFL top-paid AAV per Over The Cap (April 2026 research).
 *  Expressed in $M at the $300M base cap — capInflation scales them with
 *  cap growth in later seasons. */
const POSITION_SALARY_CEILING: Partial<Record<Position, number>> = {
  QB: 60,    // Dak Prescott peaked at $60M AAV
  WR: 41,    // Ja'Marr Chase $40.25M top
  DL: 46,    // EDGE top (Parsons $46.5M) — SubPosition override trims DT down
  CB: 32,    // McDuffie $31M top — was 25M (too tight, Tyler flagged)
  OL: 30,    // OT top (Slater $28.5M) — SubPosition override trims OG/C down
  TE: 20,    // Kittle $19.1M top — was 22 (slightly generous)
  LB: 22,    // Warner $21M off-ball top; real market has a big cliff
  S: 22,     // Kerby Joseph $21.5M top
  RB: 21,    // Barkley $20.6M top
  K: 6,      // K/P handled by their existing explicit caps below
  P: 6,
};

/** Sub-position overrides that take priority over the broad position cap.
 *  Fixes the "all DL = $46M / all OL = $30M" taxonomy problem — interior DL
 *  tops at $32M, OG at $24M, OC at $18M. */
const SUB_POSITION_SALARY_CEILING: Partial<Record<SubPosition, number>> = {
  EDGE: 46,  // Parsons $46.5M
  DT: 32,    // Chris Jones $31.75M
  OT: 30,    // Slater $28.5M — slight cushion
  OG: 24,    // Tyler Smith $24M
  C: 18,     // Creed Humphrey $18M
  // LB/DB/RB sub-positions mostly align to parent position market; no override.
};

/** Resolve the tighter of the broad Position ceiling and the SubPosition
 *  override. SubPosition wins when set (e.g. an EDGE DL uses $46M, a DT
 *  uses $32M, an OT uses $30M while a C uses $18M). */
function resolveCeiling(position?: Position, subPosition?: SubPosition): number | undefined {
  const subCap = subPosition ? SUB_POSITION_SALARY_CEILING[subPosition] : undefined;
  if (subCap !== undefined) return subCap;
  return position ? POSITION_SALARY_CEILING[position] : undefined;
}

/** Upper bound on what any player can reasonably command given their OVR,
 *  independent of the league's cap space. Prevents the exploit where a team
 *  with tons of cap space signs a 30 OVR scrub to $500M/yr (BmoreOriole
 *  Discord report). Returns the max AAV in $M (pre cap-inflation). */
export function maxReasonableAAV(overall: number, position?: Position, capInflation = 1.0, subPosition?: SubPosition): number {
  const ovr = Math.max(30, Math.min(99, overall));
  let cap: number;
  if (ovr < 40) cap = 2;        // camp body — never more than 2× minimum
  else if (ovr < 50) cap = 4;   // deep bench
  else if (ovr < 55) cap = 8;   // backup
  else if (ovr < 60) cap = 14;  // low-end starter
  else if (ovr < 65) cap = 20;  // solid starter
  else if (ovr < 70) cap = 26;  // good starter
  else if (ovr < 75) cap = 34;  // above-average — position ceiling starts biting
  else if (ovr < 80) cap = 42;  // Pro Bowl — position ceiling takes over
  else cap = 60;                // elite — position ceiling is the real limit

  // Apply the position hard ceiling too (the tighter of the two wins).
  const posCap = resolveCeiling(position, subPosition);
  if (posCap !== undefined) cap = Math.min(cap, posCap);

  return cap * capInflation;
}

/** Base cap the salary curve was designed for */
const BASE_CAP = DEFAULT_LEAGUE_SETTINGS.salaryCap; // 300

/** Compute cap inflation factor from the current team salary cap */
export function capInflationFactor(currentCap: number): number {
  return currentCap / BASE_CAP;
}

/**
 * Estimate a player's market salary.
 * @param capInflation  Ratio of current salary cap to the base cap (e.g. 420/300 = 1.4).
 *                      Pass `currentCap / 300` to scale salaries with cap growth.
 *                      Defaults to 1.0 (no scaling — backwards compatible).
 * @param subPosition   Optional — enables EDGE vs DT, OT vs OG vs C ceilings.
 */
export function estimateSalary(overall: number, position?: Position, age?: number, potential?: number, capInflation = 1.0, subPosition?: SubPosition): number {
  // Piecewise salary curve tuned to pro reality:
  //   40 OVR → league min (~$0.75M)  — practice squad / camp body
  //   50 OVR → ~$2M                  — depth / backup
  //   55 OVR → ~$8M                  — low-end starter
  //   60 OVR → ~$13M                 — solid starter
  //   65 OVR → ~$18M                 — good starter
  //   70 OVR → ~$23M                 — above-average starter
  //   80 OVR → ~$32M                 — All-Pro caliber
  //   90 OVR → ~$44M                 — elite / All-Pro
  //   99 OVR → ~$55M                 — generational
  const ovr = Math.max(40, Math.min(99, overall));
  let baseSalary: number;

  // RBs have a uniquely depressed market — custom curve
  // Real pro comps: Barkley $20.6M (elite), Henry $15M, Cook $12M,
  // Javonte Williams $8M (good starter), backup ~$1-2M
  if (position === 'RB') {
    if (ovr <= 50) {
      baseSalary = LEAGUE_MINIMUM_SALARY + (ovr - 40) / 10 * 0.5; // $0.75M to $1.25M
    } else if (ovr <= 65) {
      const t = (ovr - 50) / 15;
      baseSalary = 1.25 + t * 3.75;    // $1.25M to $5M
    } else if (ovr <= 80) {
      const t = (ovr - 65) / 15;
      baseSalary = 5.0 + t * 7.0;      // $5M to $12M
    } else {
      const t = (ovr - 80) / 19;
      baseSalary = 12.0 + t * 10.0;    // $12M to $22M
    }
    // Skip position multiplier — already baked into the RB curve
    let salary = baseSalary;

    // Age factor
    if (age !== undefined) {
      if (age <= 25) salary *= 1.10;       // Young RBs get a slight premium
      else if (age >= 30) salary *= 0.70;  // RBs decline fast after 30
      else if (age >= 28) salary *= 0.85;  // Getting old for RB
    }

    // High-potential young RBs command more
    if (potential !== undefined && age !== undefined && age <= 26) {
      salary += Math.max(0, potential - overall) * 0.10;
    }

    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  if (ovr <= 50) {
    // Linear ramp from min to $2M
    const t = (ovr - 40) / 10;
    baseSalary = LEAGUE_MINIMUM_SALARY + t * (2.0 - LEAGUE_MINIMUM_SALARY);
  } else if (ovr <= 65) {
    // $2M to $18M — the starter range (linear, not quadratic)
    const t = (ovr - 50) / 15;
    baseSalary = 2.0 + t * 16.0;
  } else if (ovr <= 80) {
    // $18M to $32M — above average to All-Pro
    const t = (ovr - 65) / 15;
    baseSalary = 18.0 + t * 14.0;
  } else {
    // $32M to $55M — elite tier
    const t = (ovr - 80) / 19;
    baseSalary = 32.0 + t * 23.0;
  }

  // Position multiplier — QBs command the most, K/P the least
  const posMult = position ? (POSITION_SALARY_MULTIPLIER[position] ?? 1.0) : 1.0;
  let salary = baseSalary * posMult;

  // Age factor: younger players with upside command a premium
  // Older declining players get discounted
  if (age !== undefined) {
    if (age <= 25) salary *= 1.15;       // Young ascending — premium
    else if (age <= 27) salary *= 1.05;  // Prime years — slight premium
    else if (age >= 33) salary *= 0.65;  // Declining — steep discount
    else if (age >= 31) salary *= 0.80;  // Late career — discount
    else if (age >= 29) salary *= 0.90;  // Starting to age
  }

  // High-potential young players command more (teams pay for ceiling)
  if (potential !== undefined && age !== undefined && age <= 27) {
    const potentialBonus = Math.max(0, potential - overall) * 0.15;
    salary += potentialBonus;
  }

  // Apply position-specific hard ceiling BEFORE cap inflation, so the cap
  // grows naturally with the league cap rather than locking a fixed dollar
  // amount across decades. SubPosition (EDGE/DT/OT/OG/C) overrides when set.
  const resolvedCeiling = resolveCeiling(position, subPosition);
  if (resolvedCeiling !== undefined) {
    salary = Math.min(salary, resolvedCeiling);
  }

  // Scale with cap inflation — salaries grow as the cap grows
  salary *= capInflation;

  // K/P hard caps — scale with inflation too
  if (position === 'K') salary = Math.min(salary, 4.0 * capInflation);
  if (position === 'P') salary = Math.min(salary, 2.5 * capInflation);

  return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
}
