/**
 * League Rules — the commissioner-tunable knobs for a BS Hoops league.
 *
 * Stored on `league.sportData.commissionerSettings` (every field optional, so a
 * save that never touched them behaves exactly as before). Every consumer reads
 * through `getLeagueRules(league)`, which fills defaults and clamps out-of-range
 * values, so a hand-edited or stale save can't push the engine somewhere absurd.
 *
 * Cap numbers live in the engine's pure cap functions (packages/sport-basketball
 * capRules), which read a module-level config; `applyCapRules(league)` pushes this
 * league's cap settings into it (the store does so on every league change).
 */

import {
  setCapRulesConfig,
  basketballSalaryCap,
  basketballDefaultSalaryCap,
  CAP_INFLATION_RATE,
  TAX_THRESHOLD_MULT,
  FIRST_APRON_MULT,
  SECOND_APRON_MULT,
  type CapRulesConfig,
} from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** What's persisted on sportData.commissionerSettings. All optional. */
export interface CommissionerSettings {
  /** Flat salary cap ($) for every season — replaces the growth curve. */
  salaryCap?: number;
  /** Annual cap growth, percent (7 = +7%/yr). */
  capGrowthPct?: number;
  /** Season + cap a custom growth rate compounds from (set by the store when the
   *  rate changes, so the change lands next season rather than rewriting this one). */
  capGrowthAnchor?: { season: number; cap: number };
  /** Luxury-tax line, percent ABOVE the cap (21.5 = cap × 1.215). */
  taxLinePct?: number;
  /** First / second apron, percent above the cap. */
  firstApronPct?: number;
  secondApronPct?: number;
  /** Scales every luxury-tax bracket rate (1 = stock $1.50–$3.75 per $1). */
  taxRateMult?: number;
  /** Max contract (10+ yr vets) as a percent of the cap; 25%/30% tiers scale with it. */
  maxContractPct?: number;
  /** Scales the whole service-time minimum-salary table. */
  minSalaryMult?: number;
  /** Last day-of-season trades are allowed. */
  tradeDeadlineDay?: number;
  /** Per-game injury chance multiplier (0 = no new injuries). */
  injuryRateMult?: number;
  /** Injury duration multiplier (season-ending injuries are unaffected). */
  injuryDurationMult?: number;
  /** Scale on young players' yearly growth. */
  progressionMult?: number;
  /** Scale on veterans' yearly decline. */
  regressionMult?: number;
  /** Years added to every retirement-age threshold (+ = longer careers). */
  retirementAgeOffset?: number;
  /** Max players on a roster (signing gate, start-of-season gate, AI trims). */
  maxRoster?: number;
}

/** Fully-resolved rules (defaults filled, values clamped). */
export interface LeagueRules {
  salaryCap: number | null;
  capGrowthPct: number;
  capGrowthAnchor: { season: number; cap: number } | null;
  taxLinePct: number;
  firstApronPct: number;
  secondApronPct: number;
  taxRateMult: number;
  maxContractPct: number;
  minSalaryMult: number;
  tradeDeadlineDay: number;
  injuryRateMult: number;
  injuryDurationMult: number;
  progressionMult: number;
  regressionMult: number;
  retirementAgeOffset: number;
  maxRoster: number;
}

const pct = (mult: number) => Math.round((mult - 1) * 1000) / 10;

export const DEFAULT_LEAGUE_RULES: Readonly<LeagueRules> = Object.freeze({
  salaryCap: null,
  capGrowthPct: Math.round(CAP_INFLATION_RATE * 1000) / 10, // 7
  capGrowthAnchor: null,
  taxLinePct: pct(TAX_THRESHOLD_MULT),      // 21.5
  firstApronPct: pct(FIRST_APRON_MULT),     // 26.7
  secondApronPct: pct(SECOND_APRON_MULT),   // 34.4
  taxRateMult: 1,
  maxContractPct: 35,
  minSalaryMult: 1,
  tradeDeadlineDay: 115,
  injuryRateMult: 1,
  injuryDurationMult: 1,
  progressionMult: 1,
  regressionMult: 1,
  retirementAgeOffset: 0,
  maxRoster: 15,
});

/** Inclusive ranges + step for each numeric rule (shared by clamping and the UI). */
export const RULE_RANGES = {
  salaryCap: { min: 80_000_000, max: 400_000_000, step: 1_000_000 },
  capGrowthPct: { min: 0, max: 15, step: 0.5 },
  taxLinePct: { min: 0, max: 60, step: 0.5 },
  firstApronPct: { min: 0, max: 80, step: 0.5 },
  secondApronPct: { min: 0, max: 100, step: 0.5 },
  taxRateMult: { min: 0, max: 3, step: 0.05 },
  maxContractPct: { min: 20, max: 50, step: 1 },
  minSalaryMult: { min: 0.5, max: 3, step: 0.05 },
  // The regular season runs days 1–170.
  tradeDeadlineDay: { min: 20, max: 165, step: 1 },
  injuryRateMult: { min: 0, max: 3, step: 0.05 },
  injuryDurationMult: { min: 0.25, max: 3, step: 0.05 },
  progressionMult: { min: 0, max: 2.5, step: 0.05 },
  regressionMult: { min: 0, max: 2.5, step: 0.05 },
  retirementAgeOffset: { min: -5, max: 5, step: 1 },
  maxRoster: { min: 13, max: 17, step: 1 },
} as const;

type NumericRule = keyof typeof RULE_RANGES;

function clampNum(v: unknown, key: NumericRule, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const { min, max } = RULE_RANGES[key];
  return Math.min(max, Math.max(min, v));
}

/** Raw stored settings (possibly empty). */
export function getCommissionerSettings(league: LeagueState | null | undefined): CommissionerSettings {
  const cs = (league?.sportData as { commissionerSettings?: CommissionerSettings } | undefined)?.commissionerSettings;
  return cs && typeof cs === 'object' ? cs : {};
}

/** Resolve a settings object to clamped, defaulted rules. */
export function resolveLeagueRules(cs: CommissionerSettings): LeagueRules {
  const d = DEFAULT_LEAGUE_RULES;
  const salaryCap = typeof cs.salaryCap === 'number' && cs.salaryCap > 0
    ? clampNum(cs.salaryCap, 'salaryCap', d.salaryCap ?? 0)
    : null;
  const taxLinePct = clampNum(cs.taxLinePct, 'taxLinePct', d.taxLinePct);
  // Keep the thresholds ordered: tax line ≤ first apron ≤ second apron.
  const firstApronPct = Math.max(taxLinePct, clampNum(cs.firstApronPct, 'firstApronPct', d.firstApronPct));
  const secondApronPct = Math.max(firstApronPct, clampNum(cs.secondApronPct, 'secondApronPct', d.secondApronPct));
  const a = cs.capGrowthAnchor;
  const capGrowthAnchor = a && Number.isFinite(a.season) && Number.isFinite(a.cap) && a.cap > 0
    ? { season: a.season, cap: a.cap }
    : null;
  return {
    salaryCap,
    capGrowthPct: clampNum(cs.capGrowthPct, 'capGrowthPct', d.capGrowthPct),
    capGrowthAnchor,
    taxLinePct,
    firstApronPct,
    secondApronPct,
    taxRateMult: clampNum(cs.taxRateMult, 'taxRateMult', d.taxRateMult),
    maxContractPct: clampNum(cs.maxContractPct, 'maxContractPct', d.maxContractPct),
    minSalaryMult: clampNum(cs.minSalaryMult, 'minSalaryMult', d.minSalaryMult),
    tradeDeadlineDay: Math.round(clampNum(cs.tradeDeadlineDay, 'tradeDeadlineDay', d.tradeDeadlineDay)),
    injuryRateMult: clampNum(cs.injuryRateMult, 'injuryRateMult', d.injuryRateMult),
    injuryDurationMult: clampNum(cs.injuryDurationMult, 'injuryDurationMult', d.injuryDurationMult),
    progressionMult: clampNum(cs.progressionMult, 'progressionMult', d.progressionMult),
    regressionMult: clampNum(cs.regressionMult, 'regressionMult', d.regressionMult),
    retirementAgeOffset: Math.round(clampNum(cs.retirementAgeOffset, 'retirementAgeOffset', d.retirementAgeOffset)),
    maxRoster: Math.round(clampNum(cs.maxRoster, 'maxRoster', d.maxRoster)),
  };
}

/** The league's rules — defaults for a league (or null) that never set any. */
export function getLeagueRules(league: LeagueState | null | undefined): LeagueRules {
  return resolveLeagueRules(getCommissionerSettings(league));
}

// ---------------------------------------------------------------------------
// Convenience getters (one source of truth per gate)
// ---------------------------------------------------------------------------

/** Last day-of-season trades are allowed (stock: Day 115 of 170). */
export function getTradeDeadlineDay(league: LeagueState | null | undefined): number {
  return getLeagueRules(league).tradeDeadlineDay;
}

/** Max roster size (stock: 15). */
export function getMaxRoster(league: LeagueState | null | undefined): number {
  return getLeagueRules(league).maxRoster;
}

/** AI depth target in free agency — one under the max (stock 14 of 15). */
export function getAiRosterTarget(league: LeagueState | null | undefined): number {
  return getMaxRoster(league) - 1;
}

// ---------------------------------------------------------------------------
// Cap rules → engine
// ---------------------------------------------------------------------------

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Translate rules into the engine's cap config. Only non-default values are
 *  emitted, so a default league yields {} and the stock code paths run untouched. */
export function capConfigFromRules(r: LeagueRules): CapRulesConfig {
  const d = DEFAULT_LEAGUE_RULES;
  const cfg: CapRulesConfig = {};
  if (r.salaryCap != null) cfg.salaryCap = r.salaryCap;
  if (r.capGrowthAnchor) {
    cfg.growthRate = r.capGrowthPct / 100;
    cfg.growthAnchor = r.capGrowthAnchor;
  }
  if (!near(r.taxLinePct, d.taxLinePct)) cfg.taxLineMult = 1 + r.taxLinePct / 100;
  if (!near(r.firstApronPct, d.firstApronPct)) cfg.firstApronMult = 1 + r.firstApronPct / 100;
  if (!near(r.secondApronPct, d.secondApronPct)) cfg.secondApronMult = 1 + r.secondApronPct / 100;
  if (!near(r.taxRateMult, d.taxRateMult)) cfg.taxRateMult = r.taxRateMult;
  if (!near(r.maxContractPct, d.maxContractPct)) cfg.maxContractPct = r.maxContractPct / 100;
  if (!near(r.minSalaryMult, d.minSalaryMult)) cfg.minSalaryMult = r.minSalaryMult;
  return cfg;
}

/** Push this league's cap rules into the engine (null clears to stock rules). */
export function applyCapRules(league: LeagueState | null | undefined): void {
  setCapRulesConfig(capConfigFromRules(getLeagueRules(league)));
}

/**
 * Merge a patch into the league's commissioner settings (pure). `undefined`
 * in the patch removes that key (= back to default). A cap-growth change
 * re-anchors at the current season's cap so it only affects FUTURE seasons.
 */
export function withCommissionerSettings(league: LeagueState, patch: Partial<CommissionerSettings>): LeagueState {
  const prev = getCommissionerSettings(league);
  const next: CommissionerSettings = { ...prev };
  for (const [k, v] of Object.entries(patch) as [keyof CommissionerSettings, unknown][]) {
    if (v === undefined || v === null) delete next[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  if ('capGrowthPct' in patch) {
    const prevRules = resolveLeagueRules(prev);
    const nextRules = resolveLeagueRules(next);
    if (!near(prevRules.capGrowthPct, nextRules.capGrowthPct)) {
      // The cap THIS season under the rules in force before the change.
      setCapRulesConfig(capConfigFromRules(prevRules));
      const season = league.currentSeason;
      const cap = basketballSalaryCap(season);
      const atDefault = near(nextRules.capGrowthPct, DEFAULT_LEAGUE_RULES.capGrowthPct);
      // Back to stock growth with the curve never having diverged → drop the anchor.
      if (atDefault && cap === basketballDefaultSalaryCap(season)) {
        delete next.capGrowthAnchor;
        delete next.capGrowthPct;
      } else {
        next.capGrowthAnchor = { season, cap };
      }
    }
  }
  const sd = (league.sportData ?? {}) as Record<string, unknown>;
  const out = { ...league, sportData: { ...sd, commissionerSettings: next } } as LeagueState;
  applyCapRules(out);
  return out;
}

/** Drop every commissioner rule (back to stock). */
export function resetCommissionerSettings(league: LeagueState): LeagueState {
  const sd = (league.sportData ?? {}) as Record<string, unknown>;
  const out = { ...league, sportData: { ...sd, commissionerSettings: {} } } as LeagueState;
  applyCapRules(out);
  return out;
}
