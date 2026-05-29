/**
 * AI auto-draft pick.
 *
 * Called when a team's pick is on the clock and the user delegates
 * (or when the picking team isn't the user-controlled GM). Selects
 * the most appropriate available prospect.
 *
 * v1 algorithm (simple but reasonable):
 *   1. Score each prospect by (overall * 0.75) + (potential * 0.25)
 *   2. Apply a positional-need multiplier if the team's roster is light
 *      at the prospect's position (1.10x if need is high, 1.00x neutral,
 *      0.92x if oversupplied)
 *   3. Add small RNG noise (±3 points) so the AI isn't perfectly
 *      predictable. Real GMs disagree.
 *   4. Pick the prospect with the highest adjusted score
 *
 * v2 enhancements (not in v1):
 *   - Team-specific strategy (rebuild vs contender) affects potential weight
 *   - "Best player available" mode vs "positional need" mode toggle
 *   - Risk preference (boom/bust vs safe)
 *   - Scouting noise per team (some teams see prospects more accurately)
 */

import type { PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballPosition } from '../types';

export interface TeamRosterSnapshot {
  teamId: TeamId;
  /** Players currently on the roster (any bucket). Used to compute
   *  positional need. Pass empty array if you want pure BPA. */
  rosterPlayers: BasketballPlayer[];
}

export interface AiPickOptions {
  /** RNG seed for reproducibility. */
  rngSeed?: string;
}

/**
 * Pick the best prospect for a team. Returns the chosen prospect's ID.
 *
 * @throws if `availableProspects` is empty.
 */
export function aiBasketballDraftPick(
  team: TeamRosterSnapshot,
  availableProspects: BasketballPlayer[],
  opts: AiPickOptions = {},
): PlayerId {
  if (availableProspects.length === 0) {
    throw new Error('aiBasketballDraftPick: no available prospects');
  }
  const rng = makeRng(opts.rngSeed ?? `ai-pick-${team.teamId}-${availableProspects.length}`);

  const needByPosition = computePositionalNeed(team.rosterPlayers);

  let bestProspect = availableProspects[0];
  let bestScore = -Infinity;
  for (const p of availableProspects) {
    const score = scoreProspect(p, needByPosition, rng);
    if (score > bestScore) {
      bestScore = score;
      bestProspect = p;
    }
  }
  return bestProspect.id;
}

function scoreProspect(
  prospect: BasketballPlayer,
  needByPosition: Record<BasketballPosition, number>,
  rng: SimpleRng,
): number {
  const ovr = prospect.ratings.overall;
  const pot = prospect.development.potential;
  // Weighted blend: ovr is 75% of value, potential is 25%
  const talent = ovr * 0.75 + pot * 0.25;

  // Positional need multiplier
  const need = needByPosition[prospect.sportData.position] ?? 1.0;

  // RNG noise: ±3 points
  const noise = (rng.random() - 0.5) * 6;

  return talent * need + noise;
}

/**
 * Compute positional need multipliers from the current roster.
 * Returns a multiplier per position:
 *   1.15 — high need (0-1 players at this position)
 *   1.00 — neutral (2-3 players)
 *   0.88 — oversupplied (4+ players)
 *
 * Tuned so a 75-OVR need-pick beats a 75-OVR oversupplied-pick in the
 * majority of trials. v2 could expose this as a per-team strategy slider
 * (e.g., rebuild teams weight talent harder, contenders weight need harder).
 */
function computePositionalNeed(roster: BasketballPlayer[]): Record<BasketballPosition, number> {
  const counts: Record<BasketballPosition, number> = {
    PG: 0, SG: 0, SF: 0, PF: 0, C: 0,
  };
  for (const p of roster) {
    counts[p.sportData.position]++;
  }
  const multipliers: Record<BasketballPosition, number> = {
    PG: 1.0, SG: 1.0, SF: 1.0, PF: 1.0, C: 1.0,
  };
  for (const pos of Object.keys(counts) as BasketballPosition[]) {
    const c = counts[pos];
    if (c <= 1) multipliers[pos] = 1.15;
    else if (c >= 4) multipliers[pos] = 0.88;
    else multipliers[pos] = 1.00;
  }
  return multipliers;
}

// ===========================================================================
// Tiny RNG (consistent with rest of package)
// ===========================================================================

interface SimpleRng {
  random(): number;
}

function makeRng(seed: string): SimpleRng {
  let s = hashString(seed);
  return {
    random(): number {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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
