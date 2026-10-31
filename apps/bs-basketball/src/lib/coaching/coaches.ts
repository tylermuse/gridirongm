/**
 * Coaching staff (parity audit P0.4 / P0.5).
 *
 * The scheme + effect primitives already live in @bs/sport-basketball's
 * coachingSystem; this layer generates coaches (head coach + a player-
 * development assistant), reads a team's staff, exposes a hiring market, and
 * rates each player's fit to the coach's scheme (the ±OVR football surfaces on
 * its roster). Contracts / firing / extensions live in ./contracts, the AI
 * offseason carousel in ./carousel.
 *
 * Generation takes an Rng so league flows (creation, carousel, migrations) are
 * deterministic per save. UI-only callers may omit it.
 */

import { v4 as uuid } from 'uuid';
import {
  createRng,
  FIRST_NAMES,
  LAST_NAMES,
  resolveBasketballSchemeEffect,
  type BasketballHCScheme,
  type BasketballPlayer,
  type Rng,
} from '@bs/sport-basketball';
import type { BaseCoach, BaseLeagueState, CoachId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const SCHEMES: BasketballHCScheme[] = ['five_out', 'horns', 'princeton', 'triangle', 'flow'];

export const SCHEME_LABELS: Record<BasketballHCScheme, string> = {
  five_out: 'Five-Out',
  horns: 'Horns',
  princeton: 'Princeton',
  triangle: 'Triangle',
  flow: 'Flow',
};

export type StaffRole = 'HC' | 'PDC';

export const ROLE_LABELS: Record<StaffRole, string> = {
  HC: 'Head Coach',
  PDC: 'Player Development',
};

/** One season on a coach's résumé, stamped at each rollover. */
export interface CoachSeasonLog {
  season: number;
  teamId: TeamId;
  wins: number;
  losses: number;
  /** Furthest playoff round reached (0 = missed, 1 = first round … 4 = Finals). */
  playoffRound: number;
  champion?: boolean;
  coy?: boolean;
}

/** Everything Hoops keeps on `coach.sportData` (all optional — old saves lack it). */
export interface CoachSportData {
  scheme?: BasketballHCScheme;
  /** Season the coach took over his current team. */
  hiredSeason?: number;
  /** Year-by-year résumé. */
  seasons?: CoachSeasonLog[];
  /** Out of coaching — never re-enters the market. */
  retired?: boolean;
  /** Stop-gap coach named after a firing / departure. */
  interim?: boolean;
  /** Real-world head coach from the roster file's `bsCoaches` block (name,
   *  age and hire season are real; ratings and scheme are simulated). */
  real?: boolean;
}

export function coachData(coach: BaseCoach): CoachSportData {
  return (coach.sportData as CoachSportData | undefined) ?? {};
}

export function withCoachData(coach: BaseCoach, patch: Partial<CoachSportData>): BaseCoach {
  return { ...coach, sportData: { ...coachData(coach), ...patch } };
}

const rndIn = (rng: Rng, min: number, max: number) => Math.round(min + rng.random() * (max - min));

/** Deterministic id drawn from the rng (seeded flows must replay identically). */
function rngId(rng: Rng, prefix: string): CoachId {
  const part = () => Math.floor(rng.random() * 2 ** 32).toString(36).padStart(7, '0');
  return `${prefix}-${part()}${part()}` as CoachId;
}

/** Fresh rng for UI one-offs that have no seed. */
function freshRng(): Rng {
  return createRng(uuid());
}

/** A head coach's overall = average of the four ratings. A dev coach's
 *  overall is his development rating (the only one that does anything). */
export function coachOverall(coach: BaseCoach): number {
  if (coach.role === 'PDC') return coach.ratings.development;
  const r = coach.ratings;
  return Math.round((r.offense + r.defense + r.development + r.morale) / 4);
}

export function coachScheme(coach: BaseCoach): BasketballHCScheme {
  return coachData(coach).scheme ?? (coach.schemes[0] as BasketballHCScheme | undefined) ?? 'horns';
}

export function schemeDescription(scheme: BasketballHCScheme): string {
  return resolveBasketballSchemeEffect(scheme).description;
}

export function generateHeadCoach(teamId: TeamId | null = null, rng: Rng = freshRng()): BaseCoach {
  const scheme = rng.pick(SCHEMES);
  const tier = rng.random();
  const base = tier < 0.15 ? 82 : tier < 0.5 ? 71 : 61; // elite / solid / journeyman
  const r = () => Math.max(45, Math.min(96, base + rndIn(rng, -8, 12)));
  return {
    id: rngId(rng, 'hc'),
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    age: rndIn(rng, 38, 66),
    role: 'HC',
    teamId,
    schemes: [scheme],
    ratings: { offense: r(), defense: r(), development: r(), morale: r() },
    history: [],
    contract: null,
    sportData: { scheme } satisfies CoachSportData,
  };
}

/**
 * A player-development assistant. His `ratings.development` (40–90, centred on
 * 65 = neutral) scales young players' growth at rollover.
 */
export function generateDevCoach(teamId: TeamId | null = null, rng: Rng = freshRng()): BaseCoach {
  const dev = Math.round(40 + ((rng.random() + rng.random()) / 2) * 50);
  const side = () => Math.max(40, Math.min(85, dev + rndIn(rng, -12, 8)));
  return {
    id: rngId(rng, 'pdc'),
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    age: rndIn(rng, 30, 64),
    role: 'PDC',
    teamId,
    schemes: [],
    ratings: { offense: side(), defense: side(), development: dev, morale: side() },
    history: [],
    contract: null,
    sportData: {} satisfies CoachSportData,
  };
}

export function generateCoach(role: StaffRole, teamId: TeamId | null, rng: Rng): BaseCoach {
  return role === 'PDC' ? generateDevCoach(teamId, rng) : generateHeadCoach(teamId, rng);
}

/** A pool of hireable head coaches (UI fallback; prefer coachingMarket). */
export function candidateCoaches(count = 6, rng: Rng = freshRng()): BaseCoach[] {
  return Array.from({ length: count }, () => generateHeadCoach(null, rng));
}

function coachMap(league: LeagueState): Record<string, BaseCoach> {
  return (league.coaches ?? {}) as Record<string, BaseCoach>;
}

/** The team's coach in `role`, or null. */
export function getTeamCoach(league: LeagueState, teamId: string, role: StaffRole): BaseCoach | null {
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return null;
  const coaches = coachMap(league);
  for (const id of team.coachIds ?? []) {
    const c = coaches[id];
    if (c && c.role === role) return c;
  }
  return null;
}

/** The team's current head coach, or null. */
export function getHeadCoach(league: LeagueState, teamId: string): BaseCoach | null {
  return getTeamCoach(league, teamId, 'HC');
}

/** The team's player-development coach, or null (vacant → neutral). */
export function getDevCoach(league: LeagueState, teamId: string): BaseCoach | null {
  return getTeamCoach(league, teamId, 'PDC');
}

/** Unemployed, un-retired coaches of a role already in the league (fired /
 *  let-go coaches looking for work). */
export function unemployedCoaches(league: LeagueState, role: StaffRole): BaseCoach[] {
  return Object.values(coachMap(league)).filter(
    c => c.role === role && !c.teamId && !coachData(c).retired,
  );
}

/**
 * The hiring market for a role: unemployed league coaches + a deterministic
 * set of fresh candidates (seeded by save + season, so the list is stable
 * across renders; already-hired candidates drop out by id).
 */
export function coachingMarket(league: LeagueState, role: StaffRole, freshCount = 6): BaseCoach[] {
  const coaches = coachMap(league);
  const rng = createRng(`${league.id}-market-${league.currentSeason}-${league.currentPhase}-${role}`);
  const fresh = Array.from({ length: freshCount + 4 }, () => generateCoach(role, null, rng))
    .filter(c => !coaches[c.id])
    .slice(0, freshCount);
  const pool = [...unemployedCoaches(league, role), ...fresh];
  return pool.sort((a, b) => coachOverall(b) - coachOverall(a));
}

/**
 * Player-development multiplier on a young (<25) player's yearly GROWTH from
 * the team's dev coach. 65 is neutral; the 40–90 range maps to ×0.85–×1.15.
 * Veterans and vacant slots are neutral (1.0).
 */
export const DEV_COACH_NEUTRAL = 65;
export const DEV_COACH_MAX_EFFECT = 0.15;
export function devCoachMultiplier(devRating: number | null | undefined, playerAge: number): number {
  if (devRating == null || playerAge >= 25) return 1;
  const t = Math.max(-1, Math.min(1, (devRating - DEV_COACH_NEUTRAL) / 25));
  return 1 + t * DEV_COACH_MAX_EFFECT;
}

export interface SchemeFit { delta: number; tier: 'great' | 'good' | 'neutral' | 'poor'; color: string }

/** How well a player fits the coach's scheme → an in-roster ±OVR hint. */
export function schemeFit(player: BasketballPlayer, scheme: BasketballHCScheme): SchemeFit {
  const r = player.ratings;
  const pos = player.sportData.position;
  let score = 0;
  switch (scheme) {
    case 'five_out': score = (r.threePoint - 70) / 9; break;                                  // needs shooters everywhere
    case 'triangle': score = (r.postScoring - 70) / 9 + (pos === 'C' || pos === 'PF' ? 1 : -1); break; // post-centric
    case 'flow': score = (r.speed - 70) / 11 + (r.handles - 70) / 15; break;                  // fast, ball-handlers
    case 'princeton': score = (r.basketballIQ - 70) / 9 + (r.passing - 70) / 14; break;       // IQ + passing
    case 'horns': score = (r.basketballIQ - 70) / 18; break;                                   // mostly neutral
  }
  const delta = score >= 1.2 ? 2 : score >= 0.4 ? 1 : score <= -1.2 ? -1 : 0;
  if (delta >= 2) return { delta, tier: 'great', color: '#10b981' };
  if (delta === 1) return { delta, tier: 'good', color: '#84cc16' };
  if (delta < 0) return { delta, tier: 'poor', color: '#dc2626' };
  return { delta, tier: 'neutral', color: 'var(--text-sec)' };
}
