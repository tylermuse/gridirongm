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
 * Development curves:
 *   ≤ 23  — Strong progression towards potential (young players improve fast)
 *   24-26 — Moderate progression, approaching peak
 *   27-30 — Prime years: slight improvements or stable, awareness still grows
 *   31-33 — Early decline: small, gradual physical decline, awareness can offset
 *   34+   — Accelerating decline: more noticeable drops, retirement risk
 *
 * @param players  The aged player array (age already +1 for the new season).
 * @param completedSeason  The season number that just finished (for ratingHistory).
 * @param progressionMult  Multiplier for progression rate (1.0 = normal, from settings)
 * @param regressionMult   Multiplier for regression rate (1.0 = normal, from settings)
 */
export function developPlayers(
  players: Player[],
  completedSeason: number,
  progressionMult = 1.0,
  regressionMult = 1.0,
): Player[] {
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
      const retirementChance = Math.min(0.90, 0.10 + (p.age - 35) * 0.10);
      if (Math.random() < retirementChance) {
        return { ...p, ratingHistory, retired: true };
      }
    }

    const ratings = { ...p.ratings };
    const primaryKeys = getPrimaryKeys(p.position);

    if (p.age <= 23) {
      // ── Strong Youth Progression ────────────────────────────────────
      // Young players grow quickly towards their potential
      if (p.potential > ratings.overall) {
        const gap = p.potential - ratings.overall;
        const growthAmount = clamp(gaussian(3.5, 2), 1, 7) * progressionMult;
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + growthAmount * 0.5,
          );
        }
        // Awareness always improves with experience for young players
        ratings.awareness = clamp(ratings.awareness + gaussian(2, 1) * progressionMult);
        ratings.overall = Math.min(p.potential, recalculateOverall(ratings, p.position));
      } else {
        // Already at potential — small fluctuations
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + gaussian(0.5, 1),
          );
        }
        ratings.overall = recalculateOverall(ratings, p.position);
      }
    } else if (p.age <= 26) {
      // ── Moderate Progression ────────────────────────────────────────
      // Still improving, but more slowly
      if (p.potential > ratings.overall) {
        const growthAmount = clamp(gaussian(2, 1.5), 0, 5) * progressionMult;
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + growthAmount * 0.4,
          );
        }
        ratings.awareness = clamp(ratings.awareness + gaussian(1.5, 1) * progressionMult);
        ratings.overall = Math.min(p.potential, recalculateOverall(ratings, p.position));
      } else {
        // At or above potential — awareness can still grow
        ratings.awareness = clamp(ratings.awareness + gaussian(1, 0.8));
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + gaussian(0.3, 1),
          );
        }
        ratings.overall = recalculateOverall(ratings, p.position);
      }
    } else if (p.age <= 30) {
      // ── Prime Years ─────────────────────────────────────────────────
      // Stable with slight improvements possible (awareness peaks here)
      ratings.awareness = clamp(ratings.awareness + gaussian(1, 0.8));
      for (const key of primaryKeys) {
        const k = key as string;
        (ratings as Record<string, number>)[k] = clamp(
          (ratings as Record<string, number>)[k] + gaussian(0.2, 1.2),
        );
      }
      // Slight speed decline starts at 29-30
      if (p.age >= 29) {
        ratings.speed = clamp(ratings.speed - gaussian(0.5, 0.5) * regressionMult);
      }
      ratings.overall = recalculateOverall(ratings, p.position);
    } else if (p.age <= 33) {
      // ── Early Decline ───────────────────────────────────────────────
      // Gradual physical decline, awareness can still grow slightly
      const yearsOver30 = p.age - 30;
      const declineAmount = clamp(gaussian(0.8 + yearsOver30 * 0.3, 0.8), 0, 3) * regressionMult;
      for (const key of primaryKeys) {
        const k = key as string;
        // Physical attributes decline, mental ones (awareness) can offset
        if (key === 'awareness') {
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + gaussian(0.5, 0.5),
          );
        } else {
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] - declineAmount * 0.4,
          );
        }
      }
      // Speed decline
      const speedDecline = clamp(gaussian(0.5 + yearsOver30 * 0.2, 0.5), 0, 2) * regressionMult;
      ratings.speed = clamp(ratings.speed - speedDecline);
      ratings.overall = recalculateOverall(ratings, p.position);
    } else {
      // ── Late Career Decline (34+) ───────────────────────────────────
      // More noticeable decline but still not catastrophic per year
      const yearsOver33 = p.age - 33;
      const declineAmount = clamp(gaussian(1.5 + yearsOver33 * 0.5, 1), 0, 4) * regressionMult;
      for (const key of primaryKeys) {
        const k = key as string;
        (ratings as Record<string, number>)[k] = clamp(
          (ratings as Record<string, number>)[k] - declineAmount * 0.5,
        );
      }
      // Faster speed decline
      const speedDecline = clamp(gaussian(1 + yearsOver33 * 0.4, 0.6), 0, 3) * regressionMult;
      ratings.speed = clamp(ratings.speed - speedDecline);
      // Stamina declines
      const staminaDecline = clamp(gaussian(1 + yearsOver33 * 0.3, 0.5), 0, 3) * regressionMult;
      ratings.stamina = clamp(ratings.stamina - staminaDecline);
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
