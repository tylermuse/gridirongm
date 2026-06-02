/**
 * Trade-value model — the "PTS" currency of the trade system.
 *
 * Replaces the old salary-as-value heuristic. A player's trade value blends:
 *   - On-court rating (OVR) on a NON-LINEAR (cubic) curve, so an 85 is worth
 *     far more than two 70s.
 *   - Career stage (age) — youth is a premium at equal OVR; steep decline past
 *     peak.
 *   - Potential (POT) — an upside premium that mostly accrues to young players.
 *   - Contract — surplus value (underpaid vs. market) lifts value; an overpay
 *     drags it. Salary MODIFIES value, it is not the value. Expiring deals take
 *     a small "rental" discount.
 *
 * Output is an abstract point value (calibrated so a franchise superstar lands
 * ~3,000–3,500 and a fringe rotation player ~150). Picks are valued on the same
 * scale (see basketballPickTradeValue) so the two are directly comparable.
 *
 * Everything is deterministic — no RNG — so a roster always values the same.
 */

import type { BasketballPlayer, BasketballPosition } from '../types';
import { basketballMarketSalary } from '../capRules/marketSalary';
import { basketballContractYearForSeason } from '../capRules/capRules';

/** Positional scarcity, mirrors the market-salary model: wings + bigs are
 *  scarcer than guards. Kept modest so OVR/age/contract dominate. */
const POSITION_VALUE_MULT: Record<BasketballPosition, number> = {
  PG: 1.0,
  SG: 0.97,
  SF: 1.05,
  PF: 0.99,
  C: 1.05,
};

/** Trade-value age curve. Distinct from the salary age curve: trade value
 *  prizes youth more aggressively (a 24-yo star is a building block; a 33-yo
 *  star is a depreciating asset), because acquirers buy future seasons. */
function ageTradeMultiplier(age: number): number {
  if (age <= 21) return 1.22;
  if (age <= 23) return 1.25; // peak trade value — young, proven enough
  if (age <= 25) return 1.18;
  if (age <= 27) return 1.08;
  if (age <= 29) return 1.0; // on-court peak, but the clock is ticking
  if (age <= 31) return 0.82;
  if (age <= 33) return 0.6;
  if (age <= 35) return 0.4;
  return 0.25;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Current-season cap hit (base + prorated bonus) for the given season. */
function currentSeasonSalary(player: BasketballPlayer, season: number): number {
  if (!player.contract) return 0;
  const y = basketballContractYearForSeason(player.contract, season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}

/** Number of contract years remaining from `season` forward (inclusive). */
function contractYearsLeft(player: BasketballPlayer, season: number): number {
  if (!player.contract) return 0;
  return player.contract.years.filter(y => y.season >= season).length;
}

export interface TradeValueOptions {
  /** Season the trade resolves in — drives the cap basis + contract year. */
  season: number;
}

/**
 * Abstract trade value (PTS) for a single player. See the file header for the
 * blend. Always >= 0.
 */
export function basketballTradeValue(player: BasketballPlayer, opts: TradeValueOptions): number {
  const ovr = player.ratings.overall;
  const age = player.age;
  const pos = player.sportData.position;
  const potential = player.development?.potential ?? ovr;

  // Non-linear OVR base: ((OVR - 50) / 45)^3 * 4500. Floored at 50 OVR.
  const norm = Math.max(0, (ovr - 50) / 45);
  const base = Math.pow(norm, 3) * 4500;

  // Upside premium for unrealized potential — weighted heavily for the young,
  // lightly for vets (an old player rarely reaches a distant ceiling).
  const potGap = Math.max(0, potential - ovr);
  const potBonus = potGap * (age <= 23 ? 6 : age <= 27 ? 3 : 1);

  let value = (base + potBonus) * ageTradeMultiplier(age) * (POSITION_VALUE_MULT[pos] ?? 1.0);

  // Contract adjustment: surplus vs. market lifts value, overpay drags it.
  const market = basketballMarketSalary(player, { season: opts.season });
  const salary = currentSeasonSalary(player, opts.season);
  if (market > 0 && salary > 0) {
    const surplusPct = (market - salary) / market; // +ve underpaid (good), -ve overpaid (bad)
    value *= clamp(1 + surplusPct * 0.35, 0.55, 1.3);
  }

  // Expiring deals are rentals — a modest discount for the loss of team control.
  if (contractYearsLeft(player, opts.season) <= 1) value *= 0.9;

  return Math.max(0, Math.round(value));
}

// ===========================================================================
// Draft-pick trade value (same PTS scale as players)
// ===========================================================================

/** Value of a pick at a known overall slot, on the player PTS scale.
 *  3,000 at #1 decaying to ~36 at #60 (exp decay). */
export function basketballPickTradeValue(overallPick: number): number {
  if (overallPick < 1) return 0;
  return Math.round(3000 * Math.exp(-0.075 * (overallPick - 1)));
}

export interface PickValueContext {
  /** Number of teams in the league (for slot math). */
  numTeams: number;
  /** Worst-to-best ordering of original team ids (index 0 = worst record =
   *  earliest pick). Used to estimate an unknown future pick's slot. */
  standingsWorstFirst: string[];
  /** Season the trade resolves in — future picks are discounted for distance. */
  currentSeason: number;
}

/**
 * Estimate a (future) pick's trade value from the original team's projected
 * standing. Picks further out are discounted for uncertainty.
 */
export function basketballFuturePickValue(
  pick: { season: number; round: number; originalTeamId: string },
  ctx: PickValueContext,
): number {
  const slot = Math.max(0, ctx.standingsWorstFirst.indexOf(pick.originalTeamId));
  const idx = slot >= 0 ? slot : Math.floor(ctx.numTeams / 2);
  const overall = (pick.round - 1) * ctx.numTeams + idx + 1;
  const base = basketballPickTradeValue(overall);
  const yearsOut = Math.max(0, pick.season - ctx.currentSeason);
  // ~8% haircut per year out — a 2029 pick is worth less than a 2027 one.
  return Math.round(base * Math.pow(0.92, yearsOut));
}
