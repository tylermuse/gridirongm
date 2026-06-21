/**
 * NBA-style draft order generator.
 *
 * Modern NBA lottery (since 2019):
 *   - 14 lottery teams = non-playoff teams (the 14 worst records)
 *   - Bottom 3 teams each have a flat 14.0% chance at the #1 pick
 *   - Picks 4-14 are determined sequentially after #1-#3 are picked
 *   - Any lottery team can win the lottery, but their final pick position
 *     is capped at "their reverse-standings slot + 4" (anti-tank rule)
 *
 * v1 detail: we resolve picks 1-3 via weighted odds, then picks 4-14 fall
 * by the surviving pre-lottery seed order. The "cannot fall more than 4
 * spots" rule is therefore satisfied *by construction*: only 3 teams can
 * leapfrog into picks 1-3, so no remaining team can be displaced more than
 * 3 slots from its pre-lottery seed. If a future revision moves to the NBA's
 * 4-team lottery (top-4 picks by ping-pong balls), the fall-cap will need
 * to be enforced explicitly because the max natural fall jumps to 4 — exactly
 * the cap, with no margin for slot-swapping.
 *
 * Picks 15-30 (Round 1) and 31-60 (Round 2): strict reverse standings
 * of the playoff teams plus straight reverse standings of all teams for
 * round 2. We pass through the seed for determinism.
 */

import type { TeamId } from '@bs/core/adapter';

// ===========================================================================
// Lottery odds (modern NBA — flattened in 2019)
// ===========================================================================

/** Odds (as combinations out of 1000) that each lottery slot wins
 *  the #1 pick. Order: slot 1 = worst record, slot 14 = 14th-worst.
 *  Slots 1-3 are flat 14.0% (140 combinations), then descending. */
const LOTTERY_ODDS_NUMBER_ONE: readonly number[] = [
  140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5,
];

/** Sanity check: combinations should sum to 1000. */
const LOTTERY_TOTAL = 1000;
{
  let sum = 0;
  for (const n of LOTTERY_ODDS_NUMBER_ONE) sum += n;
  if (sum !== LOTTERY_TOTAL) {
    // Compile-time-ish sanity. Throws at module load if odds drift.
    throw new Error(`Lottery odds sum to ${sum}, expected ${LOTTERY_TOTAL}`);
  }
}

/** Chance (in %) that the team seeded at `seedSlot` (1 = worst record, 14 =
 *  best non-playoff record) wins the No. 1 pick. Used by the lottery reveal to
 *  show each team's pre-lottery odds. Returns 0 outside the 14-team lottery. */
export function lotteryTopPickOddsPct(seedSlot: number): number {
  const combinations = LOTTERY_ODDS_NUMBER_ONE[seedSlot - 1] ?? 0;
  return combinations / (LOTTERY_TOTAL / 100);
}

// ===========================================================================
// Tiny seeded RNG (same algorithm as elsewhere in the package)
// ===========================================================================

interface SimpleRng {
  random(): number;
  int(n: number): number;
}

function makeRng(seed: string): SimpleRng {
  let s = hashString(seed);
  function next(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    random: next,
    int(n: number): number {
      return Math.floor(next() * n);
    },
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ===========================================================================
// Public API
// ===========================================================================

export interface StandingsEntry {
  teamId: TeamId;
  /** Wins. Used to sort worst-to-best. */
  wins: number;
  /** Losses. Tiebreaker after wins. */
  losses: number;
  /** True if this team made the playoffs (didn't enter the lottery). */
  madePlayoffs: boolean;
}

export interface DraftOrderOptions {
  /** RNG seed for reproducible lottery outcomes. */
  rngSeed?: string;
  /** Number of rounds. Default 2 (NBA standard). */
  rounds?: number;
}

/**
 * Generate a full draft order. Returns the picking team IDs in order
 * (index 0 = pick #1 overall, index 29 = pick #30, etc.).
 *
 * For NBA standard (2 rounds × 30 teams), returns 60 entries.
 */
export function generateBasketballDraftOrder(
  standings: StandingsEntry[],
  opts: DraftOrderOptions = {},
): TeamId[] {
  if (standings.length !== 30) {
    throw new Error(`Basketball draft order expects 30 teams (got ${standings.length})`);
  }
  const rng = makeRng(opts.rngSeed ?? 'default-draft-seed');
  const rounds = opts.rounds ?? 2;

  // ------------------------------------------------------------------
  // Sort standings worst-to-best (most losses first, then fewest wins)
  // ------------------------------------------------------------------
  const sorted = standings.slice().sort((a, b) => {
    // More losses = worse = higher pick = lower draft index
    if (a.losses !== b.losses) return b.losses - a.losses;
    // Tiebreaker: fewer wins = worse
    if (a.wins !== b.wins) return a.wins - b.wins;
    return 0;
  });

  // ------------------------------------------------------------------
  // Lottery teams = those that didn't make playoffs
  // ------------------------------------------------------------------
  const lotteryTeams = sorted.filter(s => !s.madePlayoffs);
  const playoffTeamsByRecord = sorted.filter(s => s.madePlayoffs);

  // Standard NBA: 14 lottery teams. If fewer, run a smaller lottery.
  // If more, only the bottom 14 enter the lottery.
  const numLotterySlots = Math.min(14, lotteryTeams.length);

  // ------------------------------------------------------------------
  // Run lottery for slots 1-3 (anti-tank flat odds)
  // ------------------------------------------------------------------
  const order: TeamId[] = [];
  const remainingLottery = lotteryTeams.slice(0, numLotterySlots);

  for (let lotteryPickNum = 0; lotteryPickNum < 3 && remainingLottery.length > 0; lotteryPickNum++) {
    const winnerIdx = pickByWeightedOdds(remainingLottery, rng);
    const winner = remainingLottery.splice(winnerIdx, 1)[0];
    order.push(winner.teamId);
  }

  // ------------------------------------------------------------------
  // Picks 4-14: among remaining lottery teams, by reverse standings
  // (v1 simplification: skip the "cannot fall more than 4 spots" rule)
  // ------------------------------------------------------------------
  // remainingLottery is still sorted worst-to-best by record
  for (const team of remainingLottery) {
    order.push(team.teamId);
  }

  // ------------------------------------------------------------------
  // Picks 15-30 (round 1 cont'd): reverse standings of playoff teams
  // ------------------------------------------------------------------
  for (const team of playoffTeamsByRecord) {
    order.push(team.teamId);
  }

  // ------------------------------------------------------------------
  // Round 2+: strict reverse standings across the whole league
  // ------------------------------------------------------------------
  for (let round = 1; round < rounds; round++) {
    for (const team of sorted) {
      order.push(team.teamId);
    }
  }

  return order;
}

/** Pick a winner from `teams` using LOTTERY_ODDS_NUMBER_ONE weights for
 *  whichever slots they occupy. Returns the index into `teams`. */
function pickByWeightedOdds(teams: StandingsEntry[], rng: SimpleRng): number {
  // Sum the odds for the teams currently in the lottery (some may have
  // already won a previous lottery slot and been removed)
  let total = 0;
  const weights: number[] = [];
  for (let i = 0; i < teams.length; i++) {
    const w = LOTTERY_ODDS_NUMBER_ONE[i] ?? 0;
    weights.push(w);
    total += w;
  }
  if (total <= 0) {
    // All odds collapsed (shouldn't happen). Fall back to first team.
    return 0;
  }
  let roll = rng.random() * total;
  for (let i = 0; i < teams.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return teams.length - 1;
}

// ===========================================================================
// Pick value curve (for trade evaluation)
// ===========================================================================

/**
 * Numeric value of a draft pick. Used by the trade evaluator to compare
 * pick packages. Calibrated against NBA-style pick value charts:
 *   - #1 overall = 1000 points
 *   - #14 (last lottery pick) ≈ 250
 *   - #30 (end of round 1) ≈ 100
 *   - #45 (mid round 2) ≈ 40
 *   - #60 (last pick) ≈ 15
 *
 * Curve is a smoothed exponential decay so neighboring picks have
 * similar value (no cliffs).
 */
export function basketballPickValue(overallPick: number): number {
  if (overallPick < 1) return 0;
  // Exponential: value = a * exp(-b * (pick - 1))
  // Calibrated so pick 1 = 1000, pick 60 ≈ 15
  const a = 1000;
  const b = 0.071; // ln(1000/15) / 59 ≈ 0.0712
  const v = a * Math.exp(-b * (overallPick - 1));
  return Math.max(1, Math.round(v));
}
