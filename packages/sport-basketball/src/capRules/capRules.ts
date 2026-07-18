/**
 * NBA-style salary cap rules for BS Hoops.
 *
 * Models the NBA's soft cap system:
 *   - Annual salary cap (rises with the league's BRI — Basketball Related Income)
 *   - Luxury tax threshold (~$30M above the cap typically)
 *   - First apron + second apron (declared but penalties deferred to v2)
 *   - Soft-cap exceptions (Mid-Level Exception, Bi-Annual, Bird rights)
 *
 * v1 scope:
 *   - Basic contract legality (max length, max salary as % of cap, raises)
 *   - Team payroll vs cap + tax thresholds
 *   - Dead cap from straight release (waive-and-stretch in follow-up commit)
 *   - Market salary helper
 *   - Bird rights resolution + basic cap actions (follow-up commit)
 *
 * v2 deferred:
 *   - Full apron penalties (frozen TPE, no sign-and-trades, etc.)
 *   - Sign-and-trade Base Year Compensation math
 *   - Repeater tax (luxury tax surcharge after 3+ years in tax)
 *   - Designated Veteran Extension / Designated Rookie Extension
 *   - Hard cap triggers (sign-and-trade acquisition, MLE use, etc.)
 *   - Mid-season trade deadline cap holds
 */

import type { TeamId, BaseContract, ContractYear } from '@bs/core/adapter';
import type { BasketballPlayer } from '../types';

// ===========================================================================
// Annual cap calculation
// ===========================================================================

/** League-wide cap reference for the 2026-27 season. Real-NBA cap was
 *  $140.6M in 2024-25, $154.6M in 2025-26, and the 2026-27 figure is
 *  $165M with the new TV deal kicking in (BUG-32 — the previous $140M
 *  anchor was a season behind and read as obviously stale on the Finances
 *  page). All future seasons scale from here at the historical ~7%
 *  inflation rate. */
const BASE_CAP_2026 = 165_000_000;

/** Year-over-year cap inflation. NBA averaged ~7% over the past decade
 *  due to BRI growth. */
const CAP_INFLATION_RATE = 0.07;

/** Luxury tax threshold = cap × this multiplier. Real NBA ratio is ~1.21. */
const TAX_THRESHOLD_MULT = 1.215;

/** First apron threshold = cap × this multiplier. Calibrated to the real
 *  2026-27 sheet: $209.02M on a $164.96M cap ≈ 1.267× (was 1.245, ~$3.6M low). */
const FIRST_APRON_MULT = 1.267;

/** Second apron threshold = cap × this multiplier. Calibrated to the real
 *  2026-27 sheet: $221.69M on a $164.96M cap ≈ 1.344× (was 1.295, ~$8M low). */
const SECOND_APRON_MULT = 1.344;

// Commissioner override (§1.5): a league can set a flat salary cap that replaces
// the computed one for every season. Module-level (like the tier cache in
// football) so the pure cap function can honor it without threading league state
// through every call site — the store sets it on league load / when it changes.
let salaryCapOverride: number | null = null;

/** Set (or clear, with null) the commissioner's flat salary-cap override. Called
 *  by the league store on load and whenever the setting changes. */
export function setSalaryCapOverride(cap: number | null): void {
  salaryCapOverride = typeof cap === 'number' && cap > 0 ? cap : null;
}

/** The current override, or null. */
export function getSalaryCapOverride(): number | null {
  return salaryCapOverride;
}

/** Compute the salary cap for a given season. Anchored on 2026-27 = $140M, unless
 *  a commissioner override is set (then that flat value applies to all seasons). */
export function basketballSalaryCap(season: number): number {
  if (salaryCapOverride != null) return salaryCapOverride;
  const yearsFrom2026 = season - 2026;
  const cap = BASE_CAP_2026 * Math.pow(1 + CAP_INFLATION_RATE, yearsFrom2026);
  // Round to nearest $100K for clean numbers
  return Math.round(cap / 100_000) * 100_000;
}

/** Luxury tax threshold for a given season. */
export function basketballTaxThreshold(season: number): number {
  return Math.round(basketballSalaryCap(season) * TAX_THRESHOLD_MULT / 100_000) * 100_000;
}

/** First apron threshold. */
export function basketballFirstApron(season: number): number {
  return Math.round(basketballSalaryCap(season) * FIRST_APRON_MULT / 100_000) * 100_000;
}

/** Second apron threshold. Hard cap for some teams. */
export function basketballSecondApron(season: number): number {
  return Math.round(basketballSalaryCap(season) * SECOND_APRON_MULT / 100_000) * 100_000;
}

// ===========================================================================
// Contract legality
// ===========================================================================

/** Maximum contract length in years. NBA: 5 years if signing with own
 *  Bird-rights team, 4 years otherwise. v1 uses 5 as the cap; year-3+4
 *  team option rules live in the rookie-scale module. */
const MAX_CONTRACT_YEARS = 5;

/** Maximum starting salary as % of cap, by player tier. Real NBA:
 *  - 0-6 years experience: 25% of cap
 *  - 7-9 years: 30% of cap
 *  - 10+ years: 35% of cap
 *  Plus exceptions for Designated Player Extensions (deferred to v2). */
export function maxStartingPctOfCap(yearsInLeague: number): number {
  if (yearsInLeague >= 10) return 0.35;
  if (yearsInLeague >= 7) return 0.30;
  return 0.25;
}

/** The hard max starting salary (in $) a player of this service time can sign
 *  for in `season` — 25% / 30% / 35% of the cap by years of service (0-6 / 7-9 /
 *  10+). Callers in the signing path clamp offers to this. (Designated-Player
 *  "supermax" and the Rose-Rule All-NBA bumps remain deferred to a later phase.) */
export function basketballMaxSalary(yearsInLeague: number, season: number): number {
  return basketballSalaryCap(season) * maxStartingPctOfCap(yearsInLeague);
}

/** Maximum year-over-year raise. NBA: 8% for re-signing own player,
 *  5% for signing with a new team. v1 uses 8% as the cap. */
const MAX_YEARLY_RAISE = 0.08;

/** Minimum salary by years of service, calibrated to the real 2026-27 NBA
 *  minimum scale: $1.35M (rookie) rising to $3.87M (10+ yr vet). Index by
 *  yearsInLeague, clamped to [0, 10+]. Replaces the old flat $1.2M, which both
 *  underpaid every minimum and failed to scale with service time. */
const MINIMUM_SALARY_TABLE: readonly number[] = [
  1_350_000, // 0 yrs (rookie minimum)
  2_170_000, // 1
  2_440_000, // 2
  2_530_000, // 3
  2_610_000, // 4
  2_830_000, // 5
  3_040_000, // 6
  3_260_000, // 7
  3_480_000, // 8
  3_500_000, // 9
  3_870_000, // 10+
];

/** The league minimum salary for a player with `yearsInLeague` of service. */
export function minimumSalary(yearsInLeague: number): number {
  const i = Math.max(0, Math.min(MINIMUM_SALARY_TABLE.length - 1, Math.floor(yearsInLeague)));
  return MINIMUM_SALARY_TABLE[i];
}

/** Generic minimum-salary floor (the rookie minimum) for callers that don't
 *  have a player's service time. Prefer `minimumSalary(yearsInLeague)` when the
 *  player is known. */
const LEAGUE_MINIMUM_SALARY = MINIMUM_SALARY_TABLE[0];

export interface ContractValidationResult {
  legal: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * Validate a contract against the league's cap rules.
 * Returns legal=true if the contract is fully compliant.
 *
 * @param contract  The contract to validate.
 * @param player    The player signing (used for years-in-league tier).
 * @param season    The contract's first season (matches contract.signedSeason).
 */
export function isLegalBasketballContract(
  contract: BaseContract,
  player: BasketballPlayer,
  season: number,
): ContractValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  if (contract.years.length === 0) {
    violations.push('Contract must have at least one year');
    return { legal: false, violations, warnings };
  }

  // Max length
  if (contract.years.length > MAX_CONTRACT_YEARS) {
    violations.push(`Contract exceeds max length of ${MAX_CONTRACT_YEARS} years (got ${contract.years.length})`);
  }

  // Years must be sequential starting at signedSeason
  const expectedStart = contract.signedSeason;
  for (let i = 0; i < contract.years.length; i++) {
    if (contract.years[i].season !== expectedStart + i) {
      violations.push(`Year ${i + 1} season is ${contract.years[i].season}, expected ${expectedStart + i}`);
    }
  }

  // Per-year salary validation
  const cap = basketballSalaryCap(season);
  const yearsInLeague = player.sportData.yearsInLeague;
  const maxStartPct = maxStartingPctOfCap(yearsInLeague);
  const maxStartingSalary = cap * maxStartPct;
  const firstYearTotal = contract.years[0].baseSalary + contract.years[0].proratedBonus;

  if (firstYearTotal > maxStartingSalary + 1) {
    violations.push(
      `Year-1 salary $${(firstYearTotal / 1e6).toFixed(1)}M exceeds max ${(maxStartPct * 100).toFixed(0)}% of cap ($${(maxStartingSalary / 1e6).toFixed(1)}M)`,
    );
  }

  const minSalary = minimumSalary(yearsInLeague);
  if (firstYearTotal < minSalary) {
    violations.push(
      `Year-1 salary $${(firstYearTotal / 1e6).toFixed(2)}M below league minimum $${(minSalary / 1e6).toFixed(2)}M`,
    );
  }

  // Year-over-year raises
  for (let i = 1; i < contract.years.length; i++) {
    const prev = contract.years[i - 1].baseSalary;
    const cur = contract.years[i].baseSalary;
    if (prev <= 0) continue; // skip degenerate
    const raise = (cur - prev) / prev;
    if (raise > MAX_YEARLY_RAISE + 0.001) {
      violations.push(
        `Year ${i + 1} raise ${(raise * 100).toFixed(1)}% exceeds max ${(MAX_YEARLY_RAISE * 100).toFixed(0)}%`,
      );
    }
    if (raise < -MAX_YEARLY_RAISE - 0.001) {
      warnings.push(
        `Year ${i + 1} pay cut ${(raise * 100).toFixed(1)}% — unusual but legal`,
      );
    }
  }

  return {
    legal: violations.length === 0,
    violations,
    warnings,
  };
}

// ===========================================================================
// Team payroll validation
// ===========================================================================

/** Compute a team's payroll for a given season from its players' active
 *  contracts. Player's contract year for the season is summed across
 *  all rostered players (active + injured reserve count, two-way doesn't). */
export function basketballTeamPayroll(
  players: BasketballPlayer[],
  season: number,
  /** Dead money (waived-contract cap charges) for the season — counts fully
   *  against the cap/tax/aprons in the NBA, but lives in app-layer team state,
   *  so callers thread it in. Defaults to 0 (no behavior change for old callers). */
  extraPayroll = 0,
): number {
  let total = extraPayroll;
  for (const p of players) {
    if (p.sportData.isTwoWay) continue; // two-way contracts don't hit the cap
    if (!p.contract) continue;
    const yearForSeason = p.contract.years.find(y => y.season === season);
    if (!yearForSeason) continue;
    total += yearForSeason.baseSalary + yearForSeason.proratedBonus;
  }
  return total;
}

export interface TeamCapStatus {
  payroll: number;
  cap: number;
  taxThreshold: number;
  firstApron: number;
  secondApron: number;
  /** Distance from cap (positive = under cap, negative = over). */
  capRoom: number;
  /** Tax bill if over the threshold. */
  taxBill: number;
  isOverCap: boolean;
  isOverTax: boolean;
  isOverFirstApron: boolean;
  isOverSecondApron: boolean;
}

/** Compute a team's full cap status for a season. `extraPayroll` is dead money
 *  (waived-contract charges) that counts against the cap/tax/aprons. */
export function basketballTeamCapStatus(
  players: BasketballPlayer[],
  season: number,
  extraPayroll = 0,
): TeamCapStatus {
  const payroll = basketballTeamPayroll(players, season, extraPayroll);
  const cap = basketballSalaryCap(season);
  const taxThreshold = basketballTaxThreshold(season);
  const firstApron = basketballFirstApron(season);
  const secondApron = basketballSecondApron(season);
  const isOverTax = payroll > taxThreshold;
  return {
    payroll,
    cap,
    taxThreshold,
    firstApron,
    secondApron,
    capRoom: cap - payroll,
    taxBill: isOverTax ? computeLuxuryTax(payroll, taxThreshold) : 0,
    isOverCap: payroll > cap,
    isOverTax,
    isOverFirstApron: payroll > firstApron,
    isOverSecondApron: payroll > secondApron,
  };
}

/**
 * NBA luxury tax schedule (incremental rates, v1 approximation):
 *   $0-5M over:  $1.50 per $1
 *   $5-10M over: $1.75 per $1
 *   $10-15M over: $2.50 per $1
 *   $15-20M over: $3.25 per $1
 *   $20M+ over:  $3.75 per $1 (plus $0.50 per $5M tier above)
 *
 * Repeater multiplier (3+ years in tax) deferred to v2.
 */
function computeLuxuryTax(payroll: number, threshold: number): number {
  const over = payroll - threshold;
  if (over <= 0) return 0;
  const tiers = [
    { upTo: 5_000_000, rate: 1.50 },
    { upTo: 10_000_000, rate: 1.75 },
    { upTo: 15_000_000, rate: 2.50 },
    { upTo: 20_000_000, rate: 3.25 },
  ];
  let tax = 0;
  let remaining = over;
  let prevCap = 0;
  for (const tier of tiers) {
    const tierWidth = tier.upTo - prevCap;
    const amountInTier = Math.min(remaining, tierWidth);
    tax += amountInTier * tier.rate;
    remaining -= amountInTier;
    prevCap = tier.upTo;
    if (remaining <= 0) break;
  }
  // Excess beyond $20M over: $3.75 per $1
  if (remaining > 0) tax += remaining * 3.75;
  return Math.round(tax);
}

// ===========================================================================
// Roster legality
// ===========================================================================

export interface RosterValidationResult {
  legal: boolean;
  violations: string[];
  warnings: string[];
  capStatus: TeamCapStatus;
}

/**
 * Check if a team's roster is legal. v1 covers:
 *   - Total payroll vs hard cap (only triggered if team is hard-capped via
 *     second apron OR has used certain exceptions — v1 skips this gate
 *     and warns instead of violates when over second apron)
 *   - Roster size limits (validated against adapter.rosterRules elsewhere)
 *
 * NBA's soft cap means most teams can be over the cap legally; the
 * consequences are tax bills + apron penalties, not contract rejection.
 */
export function isLegalBasketballRoster(
  players: BasketballPlayer[],
  season: number,
): RosterValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const capStatus = basketballTeamCapStatus(players, season);

  // Hard cap enforcement: only the second apron is a hard ceiling, and
  // only for teams that have hit it through specific moves (sign-and-trade
  // acquisition, MLE/BAE use). v1 warns rather than violates — full hard-cap
  // tracking comes in v2 with cap actions.
  if (capStatus.isOverSecondApron) {
    warnings.push(
      `Team payroll $${(capStatus.payroll / 1e6).toFixed(1)}M exceeds second apron ($${(capStatus.secondApron / 1e6).toFixed(1)}M) — would be hard-cap-blocked if any apron-trigger moves were made this season`,
    );
  }
  if (capStatus.isOverFirstApron) {
    warnings.push(
      `Team payroll exceeds first apron — restricted access to MLE, can't aggregate salaries in trades, etc.`,
    );
  }
  if (capStatus.isOverTax) {
    warnings.push(
      `Team payroll over tax threshold — projected luxury tax bill: $${(capStatus.taxBill / 1e6).toFixed(1)}M`,
    );
  }

  return {
    legal: violations.length === 0,
    violations,
    warnings,
    capStatus,
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Compute the total guaranteed money on a contract from now forward. */
export function basketballContractRemainingGuaranteed(
  contract: BaseContract,
  fromSeason: number,
): number {
  let total = 0;
  for (const y of contract.years) {
    if (y.season < fromSeason) continue;
    if (!y.guaranteed) continue;
    total += y.baseSalary + y.proratedBonus;
  }
  return total;
}

/** Find the contract year matching a season. Returns null if not found. */
export function basketballContractYearForSeason(
  contract: BaseContract,
  season: number,
): ContractYear | null {
  return contract.years.find(y => y.season === season) ?? null;
}

// Re-export key constants for callers (especially tests).
export {
  BASE_CAP_2026,
  CAP_INFLATION_RATE,
  TAX_THRESHOLD_MULT,
  MAX_CONTRACT_YEARS,
  MAX_YEARLY_RAISE,
  LEAGUE_MINIMUM_SALARY,
};

// TeamId is re-exported because the cap-action functions in the follow-up
// commit will reference it from a single import.
export type { TeamId };
