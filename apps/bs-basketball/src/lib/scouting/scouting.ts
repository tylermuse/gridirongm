/**
 * Draft scouting (hidden potential).
 *
 * A prospect's true potential is hidden behind a noisy projection grade until
 * you spend one of a limited pool of scouts on them — then the real ceiling is
 * revealed. The "perceived" estimate is deterministic per prospect, so the same
 * board always grades the same way; scouting corrects misperception, which is
 * what creates busts (graded high, real ceiling low) and steals (the reverse).
 */

import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getDraft } from '../draft';
import { SCOUTS_PER_DRAFT, type DraftState } from '../draft';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

interface LeagueSportData {
  draft?: DraftState;
  [key: string]: unknown;
}

export type ProjectionGrade = 'A' | 'B' | 'C' | 'D';

export const GRADE_LABEL: Record<ProjectionGrade, string> = {
  A: 'A · star upside',
  B: 'B · future starter',
  C: 'C · rotation',
  D: 'D · fringe',
};

/** Noisy potential estimate shown before scouting — deterministic per prospect. */
export function perceivedPotential(player: BasketballPlayer, season: number): number {
  const rng = makeRng(`scout-${player.id}-${season}`);
  const noise = gaussian(0, 5.5, rng);
  return clamp(Math.round(player.development.potential + noise), 40, 99);
}

export function projectionGrade(perceived: number): ProjectionGrade {
  if (perceived >= 85) return 'A';
  if (perceived >= 78) return 'B';
  if (perceived >= 70) return 'C';
  return 'D';
}

export function scoutsLeft(draft: DraftState): number {
  return draft.scoutsRemaining ?? SCOUTS_PER_DRAFT;
}

export function isScouted(draft: DraftState, prospectId: string): boolean {
  return (draft.scoutedIds ?? []).includes(prospectId as PlayerId);
}

/** True potential if the prospect has been scouted, otherwise null. */
export function revealedPotential(draft: DraftState, player: BasketballPlayer): number | null {
  return isScouted(draft, player.id) ? player.development.potential : null;
}

/** Spend one scout to reveal a prospect's true potential. */
export function scoutProspect(league: LeagueState, prospectId: string): LeagueState {
  const draft = getDraft(league);
  if (!draft) return league;
  if (isScouted(draft, prospectId) || scoutsLeft(draft) <= 0) return league;
  const next: DraftState = {
    ...draft,
    scoutedIds: [...(draft.scoutedIds ?? []), prospectId as PlayerId],
    scoutsRemaining: scoutsLeft(draft) - 1,
  };
  return { ...league, sportData: { ...(league.sportData as LeagueSportData), draft: next } };
}

// ===========================================================================
// Tiny seeded RNG
// ===========================================================================

interface Rng { random(): number }

function makeRng(seed: string): Rng {
  let s = hash(seed);
  return {
    random() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function gaussian(mean: number, std: number, rng: Rng): number {
  const u1 = rng.random() || 1e-9;
  const u2 = rng.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
