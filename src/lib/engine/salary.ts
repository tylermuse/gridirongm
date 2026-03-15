/**
 * Shared salary estimation logic.
 * Extracted to its own module to avoid circular dependencies between store.ts and playerGen.ts.
 */
import type { Position } from '@/types';
import { DEFAULT_LEAGUE_SETTINGS } from '@/types';

export const LEAGUE_MINIMUM_SALARY = DEFAULT_LEAGUE_SETTINGS.leagueMinSalary;

const POSITION_SALARY_MULTIPLIER: Partial<Record<Position, number>> = {
  QB: 1.45,
  DL: 1.05,
  WR: 0.95,
  CB: 0.95,
  OL: 0.95,
  LB: 0.90,
  S: 0.85,
  TE: 0.75,
  RB: 0.65,
  K: 0.15,
  P: 0.12,
};

export function estimateSalary(overall: number, position?: Position, age?: number, potential?: number): number {
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

  // K/P hard caps — realistic NFL market ceilings
  if (position === 'K') salary = Math.min(salary, 4.0);  // Tucker-tier max ~$5-6M, most kickers $2-4M
  if (position === 'P') salary = Math.min(salary, 2.5);  // Top punters ~$3-4M, most $1.5-2.5M

  return Math.round(salary * 10) / 10;
}
