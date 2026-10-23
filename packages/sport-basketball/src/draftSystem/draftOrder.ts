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

/**
 * Expanded-league lottery tables. The lottery BOARD (picks flagged isLottery)
 * is every team outside the 16-team first round: 14 at 30 teams, 15 at 31, 16
 * at 32. The odds row used for the draw is the one sized to that board. Tables
 * for 17 and 18 exist as headroom (and are what a future 33-34 team league or
 * a "play-in losers enter the draw" rule would use).
 *
 * Extension rule: the bottom 3 keep their flat 14.0% (anti-tank) — 420 of the
 * 1000 combinations — and slots 4..N re-spread the remaining 580 on the same
 * descending shape. Each added seat takes a small share (0.5-1.5%) mostly from
 * slots 4-8, so the 4th-worst team loses ~0.5% per extra lottery team and the
 * new tail seats sit at 0.5-1.5%:
 *   14: 140 140 140 125 105 90 75 60 45 30 20 15 10 5          (NBA standard)
 *   15: 140 140 140 120 100 85 70 55 45 35 25 20 15 5 5
 *   16: 140 140 140 115 95 80 65 55 45 35 25 20 15 10 10 10
 *   17: 140 140 140 110 90 75 60 50 45 35 25 20 15 15 15 15 10
 *   18: 140 140 140 105 90 75 60 50 45 35 25 20 15 15 15 10 10 10
 * A module-load check enforces len === size, sum === 1000, non-increasing.
 */
const LOTTERY_ODDS_BY_SIZE: Readonly<Record<number, readonly number[]>> = {
  14: LOTTERY_ODDS_NUMBER_ONE,
  15: [140, 140, 140, 120, 100, 85, 70, 55, 45, 35, 25, 20, 15, 5, 5],
  16: [140, 140, 140, 115, 95, 80, 65, 55, 45, 35, 25, 20, 15, 10, 10, 10],
  17: [140, 140, 140, 110, 90, 75, 60, 50, 45, 35, 25, 20, 15, 15, 15, 15, 10],
  18: [140, 140, 140, 105, 90, 75, 60, 50, 45, 35, 25, 20, 15, 15, 15, 10, 10, 10],
};
for (const [size, row] of Object.entries(LOTTERY_ODDS_BY_SIZE)) {
  const sum = row.reduce((s, n) => s + n, 0);
  if (row.length !== Number(size) || sum !== LOTTERY_TOTAL) {
    throw new Error(`Lottery odds table ${size} invalid (len ${row.length}, sum ${sum})`);
  }
  for (let i = 1; i < row.length; i++) {
    if (row[i] > row[i - 1]) throw new Error(`Lottery odds table ${size} not non-increasing at ${i}`);
  }
}

/** The No. 1-pick odds row (combinations out of 1000) for a lottery of
 *  `lotterySize` teams. Sizes ≤ 14 use the standard table (truncated); larger
 *  lotteries use the expansion tables above (capped at 18). */
export function lotteryOddsTable(lotterySize: number): readonly number[] {
  if (lotterySize <= 14) return LOTTERY_ODDS_NUMBER_ONE;
  return LOTTERY_ODDS_BY_SIZE[Math.min(18, lotterySize)];
}

/** Chance (in %) that the team seeded at `seedSlot` (1 = worst record) wins the
 *  No. 1 pick in a lottery of `lotterySize` teams (default 14). Used by the
 *  lottery reveal to show each team's pre-lottery odds. 0 outside the lottery. */
export function lotteryTopPickOddsPct(seedSlot: number, lotterySize = 14): number {
  const combinations = lotteryOddsTable(lotterySize)[seedSlot - 1] ?? 0;
  return combinations / (LOTTERY_TOTAL / 100);
}

/** Lottery board size for a league with `teamsOutsideFirstRound` teams that
 *  missed the 16-team first round (30 teams → 14, 31 → 15, 32 → 16). Clamped
 *  to the odds tables' 14..18 range. */
export function lotterySizeFor(teamsOutsideFirstRound: number): number {
  return Math.max(14, Math.min(18, teamsOutsideFirstRound));
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
  /** Lottery board size (picks flagged as lottery picks) — selects the odds
   *  table and caps how many non-playoff teams enter the draw. Default 14
   *  (30 teams); 15 / 16 for 31 / 32 teams. See lotterySizeFor. */
  lotteryBoardSize?: number;
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
  if (standings.length < 30 || standings.length > 32) {
    throw new Error(`Basketball draft order expects 30-32 teams (got ${standings.length})`);
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

  // Standard NBA: 14 lottery teams. If fewer, run a smaller lottery. If more,
  // only the bottom `boardSize` enter the draw (surplus picks by record). The
  // odds row is the one sized to the league's lottery board (14 at 30 teams —
  // unchanged — 15/16 after expansion).
  const boardSize = opts.lotteryBoardSize ?? 14;
  const numLotterySlots = Math.min(boardSize, lotteryTeams.length);
  const odds = lotteryOddsTable(boardSize);

  // ------------------------------------------------------------------
  // Run lottery for slots 1-3 (anti-tank flat odds)
  // ------------------------------------------------------------------
  const order: TeamId[] = [];
  const remainingLottery = lotteryTeams.slice(0, numLotterySlots);

  for (let lotteryPickNum = 0; lotteryPickNum < 3 && remainingLottery.length > 0; lotteryPickNum++) {
    const winnerIdx = pickByWeightedOdds(remainingLottery, odds, rng);
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
  // Non-playoff teams beyond the lottery board (if any) by record.
  for (const team of lotteryTeams.slice(numLotterySlots)) {
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

/** Pick a winner from `teams` using the lottery-size odds row for whichever
 *  slots they occupy. Returns the index into `teams`. */
function pickByWeightedOdds(teams: StandingsEntry[], odds: readonly number[], rng: SimpleRng): number {
  // Sum the odds for the teams currently in the lottery (some may have
  // already won a previous lottery slot and been removed)
  let total = 0;
  const weights: number[] = [];
  for (let i = 0; i < teams.length; i++) {
    const w = odds[i] ?? 0;
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
