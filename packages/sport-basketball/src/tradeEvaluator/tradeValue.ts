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

/** Positional value. Modern-game neutral: a scoring guard/wing is every bit as
 *  valuable as a big, so we do NOT discount perimeter players. Centers get no
 *  premium (the old C/SF = 1.05 vs SG = 0.97 tilt made bigs look ~8% better
 *  than equal-OVR scorers, which read backwards). Wings keep a hair of scarcity;
 *  kept tiny so OVR/age/contract dominate. */
const POSITION_VALUE_MULT: Record<BasketballPosition, number> = {
  PG: 1.0,
  SG: 1.0,
  SF: 1.02,
  PF: 0.99,
  C: 1.0,
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

// ---------------------------------------------------------------------------
// Contract model tuning (trade-value overhaul, Phase 1)
// ---------------------------------------------------------------------------

/** Underpaid-surplus premium. A player well under his market rate is a coveted
 *  asset (every rebuild hoards rookie-scale surplus). Slope + cap were widened
 *  from the old ×1.25 ceiling so a dirt-cheap stud gets a real premium (up to
 *  ×1.55 at the extreme), matching how the league prices cheap-and-good talent. */
const SURPLUS_SLOPE = 0.6;
const SURPLUS_CAP = 1.55;

/** Overpay liability, PTS per $M above market. Unlike the old multiplicative
 *  floor (0.72×, which could never push a player below zero), overpay is now an
 *  ADDITIVE drag so a bad contract can become a NET-NEGATIVE asset — the whole
 *  reason teams attach picks to dump salary. Calibrated so a clearly-overpaid
 *  non-star (~$15M+ over market) lands negative and needs a sweetener to move,
 *  while a star on a modest overpay is merely dinged, not erased. */
const LIABILITY_K = 70;

/** Floor on a single player's trade value. A toxic contract is a liability, but
 *  bounded — a team can always waive rather than pay a bottomless price to move
 *  it, and the bound keeps the sweetener needed within "a pick or two" territory. */
const VALUE_FLOOR = -1200;

/** Production is bought for THIS season, but a 34-yo's box output is worth less
 *  in TRADE than a 24-yo's identical line (the acquirer buys future seasons too).
 *  This gently decays the production floor with age so a productive vet can't
 *  out-value a same-OVR young player — while still keeping him well ahead of a
 *  washed role player (BUG-8's real intent). */
function productionAgeFactor(age: number): number {
  if (age <= 29) return 1.0;
  if (age <= 31) return 0.9;
  if (age <= 33) return 0.8;
  if (age <= 35) return 0.68;
  return 0.55;
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

/**
 * Present-output value (PTS) from a player's most recent box production, on the
 * SAME scale as the OVR-based value. Deliberately age-NEUTRAL: a contender buys
 * this season's production regardless of the player's birthday, which is why a
 * productive 34-yo vet shouldn't be valued like a washed role player. Returns 0
 * when there's no logged production (e.g. an unproven rookie — his value comes
 * from OVR/POT instead). Convex so stars dwarf rotation pieces.
 */
function recentProductionValue(player: BasketballPlayer): number {
  const log = player.sportData?.seasonLog;
  if (!log || log.length === 0) return 0;
  const recent = log.reduce((a, b) => (b.season > a.season ? b : a));
  if (recent.gamesPlayed < 10) return 0; // tiny sample → no production floor
  // Rough box contribution; PPG dominates, with credit for boards + playmaking.
  const boxScore = recent.ppg + 0.4 * recent.rpg + 0.5 * recent.apg;
  // Calibrated so a ~36 box (30/8/6 superstar) ≈ 3,200; a ~25 (21/4/5 star vet)
  // ≈ 1,400; a ~10 (role player) ≈ 200 — comparable to a mid-first-round pick.
  const norm = Math.max(0, boxScore / 36);
  return Math.round(Math.pow(norm, 2.2) * 3200);
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

  const ovrValue = (base + potBonus) * ageTradeMultiplier(age) * (POSITION_VALUE_MULT[pos] ?? 1.0);

  // Production floor: a still-productive player can't be valued below what his
  // current output is worth to a contender, even if the age curve hammers his
  // OVR-based value. This is what keeps a 21-PPG vet ahead of a raw teenager.
  // The floor is decayed with age (productionAgeFactor) so an OLD producer can't
  // out-value a same-OVR YOUNG player — the trade market pays for future seasons.
  const prodValue =
    recentProductionValue(player) * productionAgeFactor(age) * (POSITION_VALUE_MULT[pos] ?? 1.0);
  let value = Math.max(ovrValue, prodValue);

  // Contract adjustment — ASYMMETRIC (trade-value overhaul):
  //   - Underpaid → a multiplicative surplus PREMIUM (cheap-and-good is king).
  //   - Overpaid  → an ADDITIVE liability in PTS that can push value NEGATIVE,
  //     so a bad contract is a real liability a team pays (in picks) to shed.
  // Salary MODIFIES value; it is not the value.
  const market = basketballMarketSalary(player, { season: opts.season });
  const salary = currentSeasonSalary(player, opts.season);
  if (market > 0 && salary > 0) {
    if (salary <= market) {
      const surplusPct = (market - salary) / market; // 0..1, higher = cheaper
      value *= Math.min(1 + surplusPct * SURPLUS_SLOPE, SURPLUS_CAP);
    } else {
      const overpayM = (salary - market) / 1_000_000;
      // The toxicity of an overpay is the MULTI-YEAR commitment. An expiring
      // overpay is a one-year rental and then cap relief — a contender happily
      // takes a productive star on an expiring max — so scale the liability by
      // the years of control remaining. Without this, a still-productive vet on
      // a big expiring deal (e.g. a 21-PPG guard) read as the most toxic asset
      // on the board, which is backwards.
      const yearsLeft = contractYearsLeft(player, opts.season);
      const overpayYearsFactor = yearsLeft <= 1 ? 0.35 : yearsLeft === 2 ? 0.6 : yearsLeft === 3 ? 0.85 : 1.0;
      value -= overpayM * LIABILITY_K * overpayYearsFactor;
    }
  }

  // Expiring deals are rentals — a modest discount for the loss of team control,
  // but only for POSITIVE assets. An expiring bad contract is a GOOD thing (cap
  // relief next summer), so we don't deepen a negative value with a rental haircut.
  if (contractYearsLeft(player, opts.season) <= 1 && value > 0) value *= 0.9;

  return Math.max(VALUE_FLOOR, Math.round(value));
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
  /**
   * How much to trust current standings, 0..1 (default 1). Low early in the
   * season (small sample) regresses the projected slot toward the roster-quality
   * prior (below) so a pick's value doesn't swing wildly off an 8-game record.
   * Caller derives it from games played. Omitted → full trust (legacy behavior).
   */
  confidence?: number;
  /**
   * Teams ordered WORST-roster → best (index 0 = weakest roster = expected
   * earliest pick). The regression PRIOR when standings are noisy or the pick is
   * years out: a clearly-bad team's future first should project as an early pick,
   * not a league-midpoint one (§B.1). Omitted → regress toward mid-round (legacy).
   */
  rosterStrengthWorstFirst?: string[];
}

/**
 * Estimate a (future) pick's trade value from the original team's projected
 * standing. The projected slot is regressed toward the middle of the round when
 * standings are still noisy (early season) and for picks further out — both are
 * genuinely uncertain — then the value is discounted per year of distance.
 */
export function basketballFuturePickValue(
  pick: { season: number; round: number; originalTeamId: string },
  ctx: PickValueContext,
): number {
  const rank = ctx.standingsWorstFirst.indexOf(pick.originalTeamId);
  const rankSlot = rank >= 0 ? rank : Math.floor(ctx.numTeams / 2);
  const midSlot = (ctx.numTeams - 1) / 2;

  // Regression prior: the team's roster-implied finish when available (so a bad
  // team's future first stays an early pick), else the league midpoint.
  const priorRank = ctx.rosterStrengthWorstFirst?.indexOf(pick.originalTeamId) ?? -1;
  const priorSlot = priorRank >= 0 ? priorRank : midSlot;

  const yearsOut = Math.max(0, pick.season - ctx.currentSeason);
  // Trust shrinks with a small sample (confidence) and with distance: a pick two
  // drafts out barely tracks today's standings, so it leans on the roster prior.
  const trust = (ctx.confidence ?? 1) * Math.pow(0.7, yearsOut);
  const slot = rankSlot * trust + priorSlot * (1 - trust);

  const overall = (pick.round - 1) * ctx.numTeams + slot + 1;
  const base = basketballPickTradeValue(overall);
  // ~8% haircut per year out — a 2029 pick is worth less than a 2027 one.
  return Math.round(base * Math.pow(0.92, yearsOut));
}
