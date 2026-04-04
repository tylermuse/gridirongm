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

/**
 * Position-specific aging profiles.
 *   peakEnd: age when decline starts (prime ends)
 *   declineRate: multiplier on decline amount (1.0 = normal, 1.5 = faster, 0.7 = slower)
 *   retireAge: age when retirement chance kicks in
 *   retireRate: base retirement chance per year after retireAge (0.10 = 10%)
 *
 * Real NFL aging:
 *   QB: can play into late 30s/40s, decline is gradual (arm stays, legs go)
 *   K/P: longevity specialists, can play into 40s
 *   OL: durable, play well into mid-30s
 *   TE/LB/DL: moderate aging, decline mid-30s
 *   WR/S: speed-dependent, decline early-mid 30s
 *   RB/CB: most athletic, decline fastest, retire youngest
 */
export const POSITION_AGING: Record<Position, { peakEnd: number; declineRate: number; retireAge: number; retireRate: number }> = {
  QB:  { peakEnd: 33, declineRate: 0.6,  retireAge: 37, retireRate: 0.15 },
  RB:  { peakEnd: 27, declineRate: 1.5,  retireAge: 31, retireRate: 0.20 },
  WR:  { peakEnd: 30, declineRate: 1.1,  retireAge: 34, retireRate: 0.15 },
  TE:  { peakEnd: 31, declineRate: 0.9,  retireAge: 35, retireRate: 0.12 },
  OL:  { peakEnd: 32, declineRate: 0.8,  retireAge: 36, retireRate: 0.12 },
  DL:  { peakEnd: 31, declineRate: 1.0,  retireAge: 35, retireRate: 0.12 },
  LB:  { peakEnd: 30, declineRate: 1.1,  retireAge: 34, retireRate: 0.15 },
  CB:  { peakEnd: 29, declineRate: 1.4,  retireAge: 33, retireRate: 0.18 },
  S:   { peakEnd: 30, declineRate: 1.2,  retireAge: 34, retireRate: 0.15 },
  K:   { peakEnd: 35, declineRate: 0.4,  retireAge: 40, retireRate: 0.15 },
  P:   { peakEnd: 35, declineRate: 0.4,  retireAge: 40, retireRate: 0.15 },
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

/**
 * Computes OVR change based on how primary/weighted ratings changed.
 * Uses delta-based approach to avoid drift from recalculating OVR
 * (imported players' individual ratings may not reproduce their original OVR).
 */
function computeOvrDelta(
  oldRatings: PlayerRatings,
  newRatings: Record<string, number>,
  position: Position,
): number {
  const weights = POSITION_WEIGHTS[position];
  let totalDelta = 0;
  let totalWeight = 0;
  for (const key of RATING_KEYS) {
    const w = weights[key] ?? 0;
    if (w > 0) {
      totalDelta += ((newRatings[key] ?? oldRatings[key]) - oldRatings[key]) * w;
      totalWeight += w;
    }
  }
  return totalWeight > 0 ? totalDelta / totalWeight : 0;
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

    // Age-based retirement: position-specific retirement ages
    const aging = POSITION_AGING[p.position];
    if (p.teamId !== null && p.age >= aging.retireAge) {
      const yearsOverRetire = p.age - aging.retireAge;
      const retirementChance = Math.min(0.90, aging.retireRate + yearsOverRetire * 0.12);
      if (Math.random() < retirementChance) {
        return { ...p, ratingHistory, retired: true };
      }
    }

    const ratings = { ...p.ratings };
    const primaryKeys = getPrimaryKeys(p.position);

    // ── Boom/Bust effects for young drafted players ──────────────────
    // Applies in years 1-3 after being drafted (experience 1-3).
    // Busts: potential craters, development stalls or reverses.
    // Booms: potential spikes, accelerated growth beyond normal curves.
    let updatedPotential = p.potential;
    const isBusting = p.draftProfile === 'bust' && p.experience >= 1 && p.experience <= 3;
    const isBooming = p.draftProfile === 'boom' && p.experience >= 1 && p.experience <= 4;
    if (isBusting) {
      // Bust: potential craters — drops 5-10 pts per year
      const potDrop = clamp(gaussian(7, 3), 5, 12);
      updatedPotential = Math.max(30, p.potential - Math.round(potDrop));
    } else if (isBooming) {
      // Boom: potential rises — gains 3-6 pts per year
      const potBoost = clamp(gaussian(4, 2), 2, 7);
      updatedPotential = Math.min(95, p.potential + Math.round(potBoost));
    }

    // Use updatedPotential for ALL growth calculations below
    // This is critical — busts grow toward their lowered ceiling, booms toward their raised one
    const effectivePotential = updatedPotential;

    if (isBusting) {
      // ── Bust: Override normal growth — stagnation or decline ────────
      // Busts don't follow normal youth curves. They plateau or get worse.
      if (p.experience === 1) {
        // Year 1: stagnation — no meaningful growth, slight random fluctuation
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + gaussian(-0.5, 1),
          );
        }
        ratings.overall = clamp(p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position)));
      } else {
        // Years 2-3: active regression — position-specific severity
        const posDeclineRate = POSITION_AGING[p.position]?.declineRate ?? 1.0;
        const declineAmount = clamp(gaussian(2.5, 1.5), 1, 5) * regressionMult * posDeclineRate;
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] - declineAmount * 0.5,
          );
        }
        ratings.speed = clamp(ratings.speed - gaussian(0.5, 0.5) * posDeclineRate);
        ratings.overall = clamp(p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position)));
      }
    } else if (isBooming) {
      // ── Boom: Override normal growth — accelerated development ──────
      // Year 1: modest growth (2-5), Years 2-3: strong growth (3-9), Year 4: tapering (2-4)
      let growthAmount: number;
      if (p.experience === 1) {
        growthAmount = clamp(gaussian(3.5, 1.5), 2, 5) * progressionMult;
      } else if (p.experience <= 3) {
        growthAmount = clamp(gaussian(5, 2), 3, 9) * progressionMult;
      } else {
        // Year 4: tapering off
        growthAmount = clamp(gaussian(3, 1), 2, 4) * progressionMult;
      }
      for (const key of primaryKeys) {
        const k = key as string;
        (ratings as Record<string, number>)[k] = clamp(
          (ratings as Record<string, number>)[k] + growthAmount * 0.6,
        );
      }
      ratings.awareness = clamp(ratings.awareness + gaussian(3, 1) * progressionMult);
      ratings.overall = clamp(Math.min(effectivePotential, p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position))));
    } else if (p.age <= 23) {
      // ── Strong Youth Progression ────────────────────────────────────
      // Young players grow quickly towards their potential
      if (effectivePotential > ratings.overall) {
        const gap = effectivePotential - ratings.overall;
        const growthAmount = clamp(gaussian(3.5, 2), 1, 7) * progressionMult;
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + growthAmount * 0.5,
          );
        }
        // Awareness always improves with experience for young players
        ratings.awareness = clamp(ratings.awareness + gaussian(2, 1) * progressionMult);
        ratings.overall = clamp(Math.min(effectivePotential, p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position))));
      } else {
        // Already at potential — mostly stable, slight upward bias
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + gaussian(0.3, 0.5),
          );
        }
        ratings.overall = clamp(p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position)));
      }
    } else if (p.age <= 26) {
      // ── Moderate Progression ────────────────────────────────────────
      // Still improving, but more slowly
      if (effectivePotential > ratings.overall) {
        const growthAmount = clamp(gaussian(2, 1.5), 0, 5) * progressionMult;
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + growthAmount * 0.4,
          );
        }
        ratings.awareness = clamp(ratings.awareness + gaussian(1.5, 1) * progressionMult);
        ratings.overall = clamp(Math.min(effectivePotential, p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position))));
      } else {
        // At or above potential — awareness can still grow, stable otherwise
        ratings.awareness = clamp(ratings.awareness + gaussian(0.8, 0.5));
        for (const key of primaryKeys) {
          const k = key as string;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + gaussian(0.2, 0.5),
          );
        }
        ratings.overall = clamp(p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position)));
      }
    } else if (p.age <= aging.peakEnd) {
      // ── Prime Years (position-specific peak) ─────────────────────────
      // Stable with slight improvements possible (awareness peaks here)
      ratings.awareness = clamp(ratings.awareness + gaussian(0.8, 0.5));
      for (const key of primaryKeys) {
        const k = key as string;
        (ratings as Record<string, number>)[k] = clamp(
          (ratings as Record<string, number>)[k] + gaussian(0.1, 0.6),
        );
      }
      // Slight speed decline starts 2 years before peak ends
      if (p.age >= aging.peakEnd - 1) {
        ratings.speed = clamp(ratings.speed - gaussian(0.3, 0.3) * regressionMult * aging.declineRate);
      }
      ratings.overall = clamp(p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position)));
    } else if (p.age <= aging.peakEnd + 3) {
      // ── Early Decline (position-specific) ─────────────────────────────
      const yearsOverPeak = p.age - aging.peakEnd;
      const declineAmount = clamp(gaussian(0.8 + yearsOverPeak * 0.3, 0.8), 0, 3) * regressionMult * aging.declineRate;
      for (const key of primaryKeys) {
        const k = key as string;
        if (key === 'awareness') {
          // Mental attributes can still grow (especially for QBs)
          const awarenessGrowth = p.position === 'QB' ? 0.8 : 0.5;
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] + gaussian(awarenessGrowth, 0.5),
          );
        } else {
          (ratings as Record<string, number>)[k] = clamp(
            (ratings as Record<string, number>)[k] - declineAmount * 0.4,
          );
        }
      }
      const speedDecline = clamp(gaussian(0.5 + yearsOverPeak * 0.2, 0.5), 0, 2) * regressionMult * aging.declineRate;
      ratings.speed = clamp(ratings.speed - speedDecline);
      ratings.overall = clamp(p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position)));
    } else {
      // ── Late Career Decline (position-specific) ───────────────────────
      const yearsOverLate = p.age - (aging.peakEnd + 3);
      const declineAmount = clamp(gaussian(1.5 + yearsOverLate * 0.5, 1), 0, 4) * regressionMult * aging.declineRate;
      for (const key of primaryKeys) {
        const k = key as string;
        (ratings as Record<string, number>)[k] = clamp(
          (ratings as Record<string, number>)[k] - declineAmount * 0.5,
        );
      }
      // Faster speed decline
      const speedDecline = clamp(gaussian(1 + yearsOverLate * 0.4, 0.6), 0, 3) * regressionMult * aging.declineRate;
      ratings.speed = clamp(ratings.speed - speedDecline);
      // Stamina declines
      const staminaDecline = clamp(gaussian(1 + yearsOverLate * 0.3, 0.5), 0, 3) * regressionMult * aging.declineRate;
      ratings.stamina = clamp(ratings.stamina - staminaDecline);
      ratings.overall = clamp(p.ratings.overall + Math.round(computeOvrDelta(p.ratings, ratings as Record<string, number>, p.position)));
    }

    // Adjust potential based on age — past-prime players should lose upside
    let newPotential = updatedPotential;
    if (p.age >= 30) {
      // Potential decays towards current OVR (or below) as player ages
      const targetPot = Math.min(ratings.overall, updatedPotential);
      const decay = p.age >= 34 ? 3 : p.age >= 32 ? 2 : 1;
      newPotential = Math.max(targetPot - decay, Math.round(ratings.overall * 0.9));
      newPotential = clamp(newPotential);
    }

    return { ...p, ratings, potential: newPotential, ratingHistory };
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

