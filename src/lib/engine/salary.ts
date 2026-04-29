/**
 * Shared salary estimation logic.
 * Extracted to its own module to avoid circular dependencies between store.ts and playerGen.ts.
 */
import type { Position, SubPosition } from '@/types';
import { DEFAULT_LEAGUE_SETTINGS } from '@/types';

export const LEAGUE_MINIMUM_SALARY = DEFAULT_LEAGUE_SETTINGS.leagueMinSalary;

// Position multipliers — tuned against 2025-26 NFL market. Sub-position
// overrides (EDGE/DT/OT/OG/C) take priority when available; these values
// serve as fallbacks for players without a resolved sub-position.
//   QB (~$55M) > EDGE (~$42M) > WR/DT (~$32-38M) > OT/CB (~$26-30M) >
//   TE/LB/S/iOL (~$18-22M) > RB (custom curve) > K/P (~$4M/$2.5M hard cap).
const POSITION_SALARY_MULTIPLIER: Partial<Record<Position, number>> = {
  QB: 1.15,
  WR: 0.84,
  DL: 0.78,   // fallback; EDGE/DT sub-position overrides kick in when set
  OL: 0.62,   // fallback; OT/OG/C sub-position overrides kick in when set
  CB: 0.60,   // was 0.45 — McDuffie $31M, top CBs market ~$25-32M
  TE: 0.52,   // was 0.45 — Andrews/Kittle market ~$18-20M
  LB: 0.50,   // was 0.40 — Warner $21M, top LBs ~$18-22M
  S:  0.50,   // was 0.40 — Kerby Joseph $21.5M, top Ss ~$18-22M
  RB: 0.65,
  K:  0.15,
  P:  0.12,
};

/** Sub-position multipliers for interior OL — used by the general curve for OG/C.
 *  EDGE, DT, and OT have their own custom curves and don't use this table. */
const SUB_POSITION_SALARY_MULTIPLIER: Partial<Record<SubPosition, number>> = {
  OG:   0.58,  // guards — T. Smith $24M top; starters $10-18M
  C:    0.55,  // centers — Humphrey $18M top; starters $8-14M
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

/** Resolve the salary multiplier: sub-position wins over broad position when
 *  available (e.g. EDGE uses 0.93, DT uses 0.60, OT uses 0.68). */
function resolveMultiplier(position?: Position, subPosition?: SubPosition): number {
  const subMult = subPosition ? SUB_POSITION_SALARY_MULTIPLIER[subPosition] : undefined;
  if (subMult !== undefined) return subMult;
  return position ? (POSITION_SALARY_MULTIPLIER[position] ?? 1.0) : 1.0;
}

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

  // QBs have the most top-heavy market in the NFL — steep custom curve.
  // Backups make $1-5M while franchise QBs make $40-55M.
  // Real comps: backup ~$1-3M, bridge $8-15M, solid starter $22-32M,
  // franchise $40-50M (Hurts $51M, Burrow $55M), elite $48-55M.
  if (position === 'QB') {
    if (ovr <= 55) {
      // Camp arm / emergency backup — near league minimum
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (2.0 - LEAGUE_MINIMUM_SALARY); // $0.75M → $2M
    } else if (ovr <= 65) {
      // Solid backup / game manager
      const t = (ovr - 55) / 10;
      baseSalary = 2.0 + t * 6.0; // $2M → $8M
    } else if (ovr <= 75) {
      // Bridge QB / low-end starter
      const t = (ovr - 65) / 10;
      baseSalary = 8.0 + t * 14.0; // $8M → $22M
    } else if (ovr <= 85) {
      // Franchise QB
      const t = (ovr - 75) / 10;
      baseSalary = 22.0 + t * 18.0; // $22M → $40M
    } else {
      // Elite / generational
      const t = (ovr - 85) / 14;
      baseSalary = 40.0 + t * 15.0; // $40M → $55M
    }

    let salary = baseSalary;

    // Age factor — QBs age more gracefully than skill positions
    if (age !== undefined) {
      if (age <= 25) salary *= 1.10;       // Young franchise QB premium
      else if (age >= 38) salary *= 0.70;  // Very late career
      else if (age >= 35) salary *= 0.85;  // Late career
    }

    // Teams pay a ceiling premium for high-upside young QBs
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.20;
    }

    // Apply $60M ceiling then cap inflation
    salary = Math.min(salary, POSITION_SALARY_CEILING['QB'] ?? 60);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

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

  // WRs: very top-heavy. Depth $1-3M, WR3s $4-8M, WR2s $12-18M, WR1s $25-38M.
  if (position === 'WR') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (2.0 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 2.0 + t * 4.0;   // $2M → $6M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 6.0 + t * 9.0;   // $6M → $15M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 15.0 + t * 15.0; // $15M → $30M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 30.0 + t * 11.0; // $30M → $41M
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, POSITION_SALARY_CEILING['WR'] ?? 41);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  // CBs: top-heavy. Depth $1-3M, backups $3-6M, starters $10-14M, CB1s $22-30M.
  if (position === 'CB') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (2.0 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 2.0 + t * 3.0;   // $2M → $5M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 5.0 + t * 7.0;   // $5M → $12M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 12.0 + t * 12.0; // $12M → $24M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 24.0 + t * 8.0;  // $24M → $32M
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, POSITION_SALARY_CEILING['CB'] ?? 32);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  // LBs: moderate market. Depth $1-3M, starters $5-9M, top LBs $18-22M.
  if (position === 'LB') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (1.5 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 1.5 + t * 4.0;   // $1.5M → $5.5M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 5.5 + t * 5.5;   // $5.5M → $11M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 11.0 + t * 9.5;  // $11M → $20.5M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 20.5 + t * 1.5;  // $20.5M → $22M (ceiling)
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, POSITION_SALARY_CEILING['LB'] ?? 22);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  // Safeties: same market shape as LBs. Depth $1-3M, starters $5-9M, elite $18-22M.
  if (position === 'S') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (1.5 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 1.5 + t * 4.0;   // $1.5M → $5.5M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 5.5 + t * 5.5;   // $5.5M → $11M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 11.0 + t * 9.5;  // $11M → $20.5M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 20.5 + t * 1.5;  // $20.5M → $22M (ceiling)
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, POSITION_SALARY_CEILING['S'] ?? 22);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  // TEs: moderate market. Backup $1-3M, starters $5-10M, elite $17-19M.
  if (position === 'TE') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (1.5 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 1.5 + t * 3.5;   // $1.5M → $5M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 5.0 + t * 6.0;   // $5M → $11M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 11.0 + t * 8.0;  // $11M → $19M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 19.0 + t * 2.0;  // $19M → $21M (ceiling $20M applies)
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, POSITION_SALARY_CEILING['TE'] ?? 20);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  // EDGE rushers: most top-heavy defensive market. Rotational $3-6M, starters $14-22M, elite $34-44M.
  if (subPosition === 'EDGE') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (2.5 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 2.5 + t * 3.0;   // $2.5M → $5.5M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 5.5 + t * 8.5;   // $5.5M → $14M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 14.0 + t * 16.0; // $14M → $30M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 30.0 + t * 16.0; // $30M → $46M
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, SUB_POSITION_SALARY_CEILING['EDGE'] ?? 46);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  // Interior DL (DT): significantly below EDGE market. Rotational $2-4M, starters $9-16M, elite $22-30M.
  if (subPosition === 'DT') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (1.5 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 1.5 + t * 2.5;   // $1.5M → $4M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 4.0 + t * 6.0;   // $4M → $10M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 10.0 + t * 12.0; // $10M → $22M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 22.0 + t * 10.0; // $22M → $32M
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, SUB_POSITION_SALARY_CEILING['DT'] ?? 32);
    salary *= capInflation;
    return Math.round(Math.max(LEAGUE_MINIMUM_SALARY, salary) * 10) / 10;
  }

  // Offensive tackles: premium OL. Backup $2-5M, starters $7-16M, elite $27-28M.
  if (subPosition === 'OT') {
    if (ovr <= 55) {
      const t = (ovr - 40) / 15;
      baseSalary = LEAGUE_MINIMUM_SALARY + t * (2.0 - LEAGUE_MINIMUM_SALARY);
    } else if (ovr <= 65) {
      const t = (ovr - 55) / 10;
      baseSalary = 2.0 + t * 5.0;   // $2M → $7M
    } else if (ovr <= 75) {
      const t = (ovr - 65) / 10;
      baseSalary = 7.0 + t * 9.0;   // $7M → $16M
    } else if (ovr <= 85) {
      const t = (ovr - 75) / 10;
      baseSalary = 16.0 + t * 12.0; // $16M → $28M
    } else {
      const t = (ovr - 85) / 14;
      baseSalary = 28.0 + t * 3.0;  // $28M → $31M (ceiling $30M applies)
    }
    let salary = baseSalary;
    if (age !== undefined) {
      if (age <= 25) salary *= 1.15;
      else if (age <= 27) salary *= 1.05;
      else if (age >= 33) salary *= 0.65;
      else if (age >= 31) salary *= 0.80;
      else if (age >= 29) salary *= 0.90;
    }
    if (potential !== undefined && age !== undefined && age <= 27) {
      salary += Math.max(0, potential - overall) * 0.15;
    }
    salary = Math.min(salary, SUB_POSITION_SALARY_CEILING['OT'] ?? 30);
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

  // Position multiplier — sub-position wins when set (EDGE > DT, OT > OG/C)
  const posMult = resolveMultiplier(position, subPosition);
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
