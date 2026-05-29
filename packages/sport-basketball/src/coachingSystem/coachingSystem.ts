/**
 * Basketball coaching system.
 *
 * Defines:
 *   - Coach roles: HC (head coach), AC (assistant), PDC (player development),
 *     ATC (athletic trainer).
 *   - Tactical schemes head coaches can run, grouped by philosophy.
 *   - Helper functions for resolving coach effects on the sim.
 *
 * v1 effects model (simple, declarative):
 *   - HC scheme nudges pace, shot selection, and defensive style
 *   - PDC adds a small development boost to younger players
 *   - ATC reduces injury rate
 *
 * The CoachingSystem contract from @bs/core/adapter is type-only — it just
 * tells the core which roles + schemes exist. The actual effects are
 * applied by sport-specific consumers (sim engine, development system).
 */

import type { CoachingSystem } from '@bs/core/adapter';

// ===========================================================================
// Roles
// ===========================================================================

/** Basketball coaching roles. */
export const BASKETBALL_COACH_ROLES = ['HC', 'AC', 'PDC', 'ATC'] as const;
export type BasketballCoachRole = typeof BASKETBALL_COACH_ROLES[number];

// ===========================================================================
// Schemes
// ===========================================================================

/** Head coach tactical schemes. Each leans toward a play style. */
export const BASKETBALL_HC_SCHEMES = [
  'five_out',    // 5-out spread, heavy 3PA
  'horns',       // double-high screen action, balanced
  'princeton',   // motion + backdoor cuts, medium pace
  'triangle',    // post-centric, slow pace
  'flow',        // free-flowing read-and-react, fast pace
] as const;
export type BasketballHCScheme = typeof BASKETBALL_HC_SCHEMES[number];

/** Coaching schemes by role. AC/PDC/ATC don't carry tactical schemes — they
 *  have ratings that contribute via the helper functions below. */
export const BASKETBALL_SCHEMES: Record<BasketballCoachRole, readonly string[]> = {
  HC: BASKETBALL_HC_SCHEMES,
  AC: [],
  PDC: [],
  ATC: [],
};

// ===========================================================================
// Scheme effects (consumed by sim engine + development system)
// ===========================================================================

export interface CoachSchemeEffect {
  /** Multiplier on possessions per game (1.0 = neutral). */
  paceMultiplier: number;
  /** Multiplier on 3-point attempt rate (1.0 = neutral). */
  threePointAttemptMultiplier: number;
  /** Multiplier on post-up attempt rate. */
  postAttemptMultiplier: number;
  /** Multiplier on defensive intensity (1.0 = neutral). */
  defensiveIntensityMultiplier: number;
  /** Human description for the UI. */
  description: string;
}

const HC_SCHEME_EFFECTS: Record<BasketballHCScheme, CoachSchemeEffect> = {
  five_out: {
    paceMultiplier: 1.04,
    threePointAttemptMultiplier: 1.15,
    postAttemptMultiplier: 0.70,
    defensiveIntensityMultiplier: 1.00,
    description: 'Spread the floor with five shooters; live and die by the three.',
  },
  horns: {
    paceMultiplier: 1.00,
    threePointAttemptMultiplier: 1.00,
    postAttemptMultiplier: 0.95,
    defensiveIntensityMultiplier: 1.05,
    description: 'Balanced two-screen pick-and-roll attack; sound defense.',
  },
  princeton: {
    paceMultiplier: 0.95,
    threePointAttemptMultiplier: 1.05,
    postAttemptMultiplier: 0.90,
    defensiveIntensityMultiplier: 1.00,
    description: 'Motion offense with cuts and ball movement; patient possessions.',
  },
  triangle: {
    paceMultiplier: 0.88,
    threePointAttemptMultiplier: 0.80,
    postAttemptMultiplier: 1.30,
    defensiveIntensityMultiplier: 1.05,
    description: 'Post-centric, slow-paced triangle offense.',
  },
  flow: {
    paceMultiplier: 1.10,
    threePointAttemptMultiplier: 1.05,
    postAttemptMultiplier: 0.85,
    defensiveIntensityMultiplier: 0.95,
    description: 'High-pace read-and-react; offensive freedom over defensive discipline.',
  },
};

/**
 * Resolve a head coach's scheme into per-game multipliers the sim engine
 * applies on top of baseline tendencies.
 */
export function resolveBasketballSchemeEffect(scheme: BasketballHCScheme): CoachSchemeEffect {
  return HC_SCHEME_EFFECTS[scheme];
}

/** All schemes + their effect summaries — for UI menus. */
export function listBasketballSchemes(): { scheme: BasketballHCScheme; effect: CoachSchemeEffect }[] {
  return BASKETBALL_HC_SCHEMES.map(scheme => ({ scheme, effect: HC_SCHEME_EFFECTS[scheme] }));
}

// ===========================================================================
// Development coach effects
// ===========================================================================

/**
 * Resolve a player development coach's contribution: small bonus to
 * development progression for younger players. Returns a multiplier on
 * the normal growth rate.
 */
export function resolveBasketballPDCEffect(
  pdcRating: number, // 50-99
  playerAge: number,
): number {
  // Above-average PDC (>70) speeds up growth for sub-25 players
  if (playerAge >= 25) return 1.0;
  const bonus = Math.max(0, (pdcRating - 70) / 100); // up to +0.29 at 99
  return 1.0 + bonus * 0.5; // capped at +14.5% growth
}

/** Athletic trainer effect: reduce injury rate based on training rating. */
export function resolveBasketballATCEffect(atcRating: number): number {
  // ATC >70 reduces injury rate; <70 increases it.
  const delta = (atcRating - 70) / 100; // -0.7 to +0.29
  return Math.max(0.6, 1.0 - delta * 0.5); // never below 60% of baseline
}

// ===========================================================================
// CoachingSystem export — matches @bs/core/adapter contract
// ===========================================================================

export const basketballCoachingSystem: CoachingSystem = {
  roles: BASKETBALL_COACH_ROLES,
  schemes: BASKETBALL_SCHEMES,
  maxStaffSize: 6,
};
