/**
 * Coaching staff (parity audit P0.4 / P0.5).
 *
 * The scheme + effect primitives already live in @bs/sport-basketball's
 * coachingSystem; this layer generates head coaches, computes their salary +
 * overall, exposes a hiring candidate pool, and rates each player's fit to the
 * coach's scheme (the ±OVR football surfaces on its roster).
 */

import { v4 as uuid } from 'uuid';
import {
  randomName,
  resolveBasketballSchemeEffect,
  type BasketballHCScheme,
  type BasketballPlayer,
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

interface CoachSportData { scheme: BasketballHCScheme }

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

/** A head coach's overall = average of the four ratings. */
export function coachOverall(coach: BaseCoach): number {
  const r = coach.ratings;
  return Math.round((r.offense + r.defense + r.development + r.morale) / 4);
}

/** Salary ($/yr), derived from overall — elite coaches cost more. */
export function coachSalary(coach: BaseCoach): number {
  const ovr = coachOverall(coach);
  const m = 2_000_000 + Math.max(0, ovr - 58) / 37 * 9_000_000;
  return Math.round(m / 100_000) * 100_000;
}

export function coachScheme(coach: BaseCoach): BasketballHCScheme {
  return (coach.sportData as CoachSportData | undefined)?.scheme ?? coach.schemes[0] as BasketballHCScheme ?? 'horns';
}

export function schemeDescription(scheme: BasketballHCScheme): string {
  return resolveBasketballSchemeEffect(scheme).description;
}

export function generateHeadCoach(teamId: TeamId | null = null): BaseCoach {
  const name = randomName();
  const scheme = SCHEMES[Math.floor(Math.random() * SCHEMES.length)];
  const tier = Math.random();
  const base = tier < 0.15 ? 82 : tier < 0.5 ? 71 : 61; // elite / solid / journeyman
  const r = () => Math.max(45, Math.min(96, base + rnd(-8, 12)));
  return {
    id: uuid() as CoachId,
    firstName: name.firstName,
    lastName: name.lastName,
    age: rnd(38, 66),
    role: 'HC',
    teamId,
    schemes: [scheme],
    ratings: { offense: r(), defense: r(), development: r(), morale: r() },
    history: [],
    contract: null,
    sportData: { scheme } as CoachSportData,
  };
}

/** A pool of hireable head coaches. */
export function candidateCoaches(count = 6): BaseCoach[] {
  return Array.from({ length: count }, () => generateHeadCoach(null));
}

/** The team's current head coach, or null. */
export function getHeadCoach(league: LeagueState, teamId: string): BaseCoach | null {
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return null;
  for (const id of team.coachIds) {
    const c = (league.coaches as Record<string, BaseCoach>)[id];
    if (c && c.role === 'HC') return c;
  }
  return null;
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
