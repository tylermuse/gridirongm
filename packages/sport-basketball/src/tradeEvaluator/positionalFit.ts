/**
 * Positional fit for the trade engine (trade-value overhaul, Phase 2 §D/§E).
 *
 * Real teams trade FOR needs and FROM surplus — nobody trades for a third
 * starting center. This module derives a starter-independent read of a roster's
 * strength at each position (so it works for any AI team without a set lineup)
 * and exposes:
 *   - positionalNeed(roster, pos): 0 (strong/deep) .. 1 (gaping hole)
 *   - isPositionalSurplus(roster, pos): the team can deal FROM here
 *   - positionalFitShift(...): PTS of extra acceptance tolerance a team extends
 *     for a deal that improves its positional balance (and withholds for one
 *     that piles onto a strength).
 *
 * Deterministic — reads only OVR + position off the roster.
 */

import type { BasketballPlayer, BasketballPosition } from '../types';
import { basketballTradeValue } from './tradeValue';

/** OVR at/above which a player counts as rotation-quality depth. */
const ROTATION_OVR = 70;
/** Benchmark for a league-average starter — a team whose best at a position is
 *  well below this has a real need there. */
const STARTER_OVR = 75;

const emptyByPos = (): Record<BasketballPosition, number> => ({ PG: 0, SG: 0, SF: 0, PF: 0, C: 0 });

interface PositionalProfile {
  /** Best OVR at each position (0 if the team has nobody there). */
  best: Record<BasketballPosition, number>;
  /** Count of rotation-quality (OVR ≥ ROTATION_OVR) players at each position. */
  depth: Record<BasketballPosition, number>;
}

function positionalProfile(roster: BasketballPlayer[]): PositionalProfile {
  const best = emptyByPos();
  const depth = emptyByPos();
  for (const p of roster) {
    const pos = p.sportData.position;
    if (!pos) continue;
    const ovr = p.ratings.overall;
    if (ovr > best[pos]) best[pos] = ovr;
    if (ovr >= ROTATION_OVR) depth[pos] += 1;
  }
  return { best, depth };
}

/**
 * How badly a team needs help at `pos`, 0 (strong/deep) .. 1 (hole). Driven by
 * the gap between the team's best player there and a starter benchmark, with a
 * small extra bump when the position is also thin on rotation bodies.
 */
export function positionalNeed(roster: BasketballPlayer[], pos: BasketballPosition): number {
  const { best, depth } = positionalProfile(roster);
  // best 75+ → 0 need; best 50 → 1 need (25-point spread).
  const starterGap = Math.max(0, Math.min(1, (STARTER_OVR - best[pos]) / 25));
  // Thin depth (0–1 rotation bodies) nudges need up even behind a decent starter.
  const depthBump = depth[pos] <= 1 ? 0.15 : 0;
  return Math.min(1, starterGap + depthBump);
}

/** True if a team is DEEP enough at a position to trade FROM it without opening
 *  a hole — three rotation bodies, or two with a genuine starter on top. */
export function isPositionalSurplus(roster: BasketballPlayer[], pos: BasketballPosition): boolean {
  const { best, depth } = positionalProfile(roster);
  return depth[pos] >= 3 || (depth[pos] >= 2 && best[pos] >= STARTER_OVR + 3);
}

/** Acceptance multiplier for acquiring a player at `pos`: > 1 when it fills a
 *  need, < 1 when it piles onto a strength. */
function needMultiplier(roster: BasketballPlayer[], pos: BasketballPosition): number {
  if (isPositionalSurplus(roster, pos)) return 0.8;
  return 1 + positionalNeed(roster, pos) * 0.4; // 1.0 (no need) .. 1.4 (hole)
}

/**
 * PTS of extra acceptance tolerance a team extends for the positional shape of a
 * deal: it will stomach a bit MORE value loss for players that fill needs, and a
 * bit LESS for redundant ones. Losing a surplus player is easy; losing a need
 * position hurts. Bounded so fit flavors — never dominates — the value math.
 */
export function positionalFitShift(
  roster: BasketballPlayer[],
  incoming: BasketballPlayer[],
  outgoing: BasketballPlayer[],
  season: number,
): number {
  let shift = 0;
  for (const p of incoming) {
    const pos = p.sportData.position;
    if (!pos) continue;
    shift += basketballTradeValue(p, { season }) * (needMultiplier(roster, pos) - 1);
  }
  for (const p of outgoing) {
    const pos = p.sportData.position;
    if (!pos) continue;
    // Giving up a surplus body is fine (adds tolerance); giving up a need hurts.
    shift -= basketballTradeValue(p, { season }) * (needMultiplier(roster, pos) - 1);
  }
  return Math.round(Math.max(-800, Math.min(800, shift)));
}
