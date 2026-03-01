import type { Player, PlayerRatings, Position } from '@/types';
import { POSITION_WEIGHTS } from './playerGen';

// ---------------------------------------------------------------------------
// Internal utilities (mirrors playerGen helpers)
// ---------------------------------------------------------------------------

const RATING_KEYS: (keyof Omit<PlayerRatings, 'overall'>)[] = [
  'speed', 'strength', 'agility', 'awareness', 'stamina',
  'throwing', 'catching', 'carrying', 'blocking',
  'tackling', 'coverage', 'passRush', 'kicking',
];

function clamp(val: number, lo = 20, hi = 99): number {
  return Math.round(Math.max(lo, Math.min(hi, val)));
}

function gaussian(mean: number, stdDev: number): number {
  // Box-Muller
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Returns the rating keys that are "primary" for a position (weight ≥ 2). */
function getPrimaryKeys(position: Position): (keyof Omit<PlayerRatings, 'overall'>)[] {
  const weights = POSITION_WEIGHTS[position];
  return RATING_KEYS.filter(k => (weights[k] ?? 0) >= 2);
}

/** Recomputes the overall rating from individual ratings using position weights. */
function recalculateOverall(ratings: PlayerRatings, position: Position): number {
  const weights = POSITION_WEIGHTS[position];
  const weightedSum = RATING_KEYS.reduce((sum, key) => {
    const w = weights[key] ?? 0;
    return sum + ratings[key] * (w || 0.2);
  }, 0);
  const totalWeight = RATING_KEYS.reduce((sum, key) => {
    return sum + ((weights[key] ?? 0) || 0.2);
  }, 0);
  return clamp(Math.round(weightedSum / totalWeight));
}

// ---------------------------------------------------------------------------
// Core development function
// ---------------------------------------------------------------------------

/**
 * Applies off-season development (growth, decline, or retirement) to every player.
 * Expects players to have already had their age incremented by the caller.
 *
 * @param players  The aged player array (age already +1 for the new season).
 * @param completedSeason  The season number that just finished (for ratingHistory).
 */
export function developPlayers(players: Player[], completedSeason: number): Player[] {
  return players.map(p => {
    // Already retired — nothing to do
    if (p.retired) return p;

    // Record this season's ending OVR before any development changes
    const ratingHistory = [
      ...(p.ratingHistory ?? []),
      { season: completedSeason, overall: p.ratings.overall },
    ];

    // Age-based retirement: only active roster players (teamId !== null)
    if (p.teamId !== null && p.age >= 35) {
      const retirementChance = Math.min(0.95, 0.15 + (p.age - 35) * 0.12);
      if (Math.random() < retirementChance) {
        return { ...p, ratingHistory, retired: true };
      }
    }

    const ratings = { ...p.ratings };
    const primaryKeys = getPrimaryKeys(p.position);

    if (p.age <= 25) {
      // ── Youth Progression ──────────────────────────────────────────────
      // Only grow if they haven't hit their ceiling yet
      if (p.potential > ratings.overall) {
        const growthAmount = clamp(gaussian(4, 3), 0, 8);
        for (const key of primaryKeys) {
          (ratings as Record<string, number>)[key] = clamp(
            (ratings as Record<string, number>)[key] + growthAmount * 0.6,
          );
        }
        ratings.overall = Math.min(p.potential, recalculateOverall(ratings, p.position));
      }
    } else if (p.age <= 29) {
      // ── Peak ───────────────────────────────────────────────────────────
      // Small random fluctuations around current level
      for (const key of primaryKeys) {
        (ratings as Record<string, number>)[key] = clamp(
          (ratings as Record<string, number>)[key] + gaussian(0.5, 2),
        );
      }
      ratings.overall = recalculateOverall(ratings, p.position);
    } else {
      // ── Decline ────────────────────────────────────────────────────────
      const yearsOver30 = p.age - 30;
      const declineAmount = clamp(gaussian(2 + yearsOver30 * 0.8, 1.5), 0, 6);
      for (const key of primaryKeys) {
        (ratings as Record<string, number>)[key] = clamp(
          (ratings as Record<string, number>)[key] - declineAmount * 0.5,
        );
      }
      // Speed declines for all positions starting at 28
      if (p.age >= 28) {
        const speedDecline = clamp(gaussian(1 + (p.age - 28) * 0.3, 0.8), 0, 4);
        ratings.speed = clamp(ratings.speed - speedDecline);
      }
      ratings.overall = recalculateOverall(ratings, p.position);
    }

    return { ...p, ratings, ratingHistory };
  });
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Returns a display string for a player's potential.
 * Shows the exact number once the player has 3+ seasons of experience,
 * otherwise returns a descriptive range label.
 */
export function potentialLabel(potential: number, experience: number): string {
  if (experience >= 3) return String(potential);
  if (potential >= 85) return 'Elite';
  if (potential >= 75) return 'High';
  if (potential >= 65) return 'Average';
  if (potential >= 55) return 'Low';
  return '?';
}

/**
 * Returns a Tailwind color class for a potential display value.
 * Uses muted color for unknown ranges so users understand it's estimated.
 */
export function potentialColor(potential: number, experience: number): string {
  if (experience < 3) return 'text-[var(--text-sec)]'; // unknown — muted
  if (potential >= 80) return 'text-green-400';
  if (potential >= 65) return 'text-blue-400';
  if (potential >= 50) return 'text-amber-400';
  return 'text-red-400';
}
