/**
 * Draft scouting (hidden potential) — tiered.
 *
 * A prospect's true potential is hidden behind a noisy projection grade (the
 * perceived estimate, deterministic per prospect) until you scout him. Scouting
 * is tiered under a per-draft points budget:
 *
 *   L1 Quick look      (1 pt)  potential range narrows; noisy skill-band grades
 *   L2 Workout         (3 pts) range narrows again; combine measurables +
 *                              strengths / question marks; skill noise halves
 *   L3 Full evaluation (6 pts) exact potential, gem/bust verdict, archetype +
 *                              NBA comp
 *
 * Costs are cumulative totals — upgrading pays only the difference (a quick
 * look then a full eval costs 1 + 5 = 6). 30 pts/draft = ~4 full evals plus a
 * handful of quick looks, or ~10 workouts, or 30 quick looks.
 *
 * Scouting corrects misperception, which is what creates busts (graded high,
 * real ceiling low) and steals (the reverse).
 *
 * Back-compat: saves from the flat 8-scout system carry `scoutedIds` +
 * `scoutsRemaining`. Those prospects read as fully evaluated (L3), and the
 * remaining flat scouts convert proportionally to points. Nothing is rewritten
 * until the next scouting action, which then writes the tiered fields.
 *
 * Everything is pure + deterministic: per-prospect noise is seeded off the
 * save (league.id), prospect id, and draft season. No Math.random.
 */

import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import { developmentFactorFor, type BasketballPlayer, type BasketballRatings, type BasketballStats } from '@bs/sport-basketball';
import { getDraft } from '../draft/draft';
import { SCOUTS_PER_DRAFT, SCOUT_POINTS_PER_DRAFT, type DraftState, type ScoutLevel } from '../draft/types';

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

// ===========================================================================
// Tiers
// ===========================================================================

export interface ScoutTier {
  level: Exclude<ScoutLevel, 0>;
  name: string;
  /** Cumulative cost to reach this tier from unscouted. */
  cost: number;
  reveals: string;
}

export const SCOUT_TIERS: readonly ScoutTier[] = [
  { level: 1, name: 'Quick look', cost: 1, reveals: 'Narrower potential range + skill-band grades' },
  { level: 2, name: 'Workout', cost: 3, reveals: 'Combine measurables, strengths & question marks' },
  { level: 3, name: 'Full evaluation', cost: 6, reveals: 'Exact potential, gem/bust verdict, NBA comp' },
] as const;

/** Cumulative cost to reach `level` (0 for level 0). */
export function tierCost(level: ScoutLevel): number {
  return level === 0 ? 0 : SCOUT_TIERS[level - 1].cost;
}

/** Points needed to go from the prospect's current level to `level` (0 if already there). */
export function upgradeCost(draft: DraftState, prospectId: string, level: ScoutLevel): number {
  return Math.max(0, tierCost(level) - tierCost(scoutLevel(draft, prospectId)));
}

/** Potential-range half-width per tier. L3 = exact. */
const RANGE_HALF_WIDTH: Record<ScoutLevel, number> = { 0: 12, 1: 8, 2: 4, 3: 0 };
/** Skill-grade noise (± rating points) per tier. */
const SKILL_NOISE: Record<ScoutLevel, number> = { 0: 0, 1: 7, 2: 3, 3: 0 };

// ===========================================================================
// Budget + level (with lazy legacy conversion)
// ===========================================================================

/** Scouting points left this draft. Legacy saves convert flat scouts → points. */
export function scoutPointsLeft(draft: DraftState): number {
  if (typeof draft.scoutPoints === 'number') return draft.scoutPoints;
  if (typeof draft.scoutsRemaining === 'number') {
    return Math.max(0, Math.round((draft.scoutsRemaining / SCOUTS_PER_DRAFT) * SCOUT_POINTS_PER_DRAFT));
  }
  return SCOUT_POINTS_PER_DRAFT;
}

/** @deprecated use scoutPointsLeft — kept for callers of the flat system. */
export const scoutsLeft = scoutPointsLeft;

/** Highest tier reached on a prospect. Legacy scoutedIds count as fully evaluated. */
export function scoutLevel(draft: DraftState, prospectId: string): ScoutLevel {
  const lvl = draft.scoutLevels?.[prospectId];
  if (lvl) return lvl;
  if ((draft.scoutedIds ?? []).includes(prospectId as PlayerId)) return 3;
  return 0;
}

/** True once the prospect's TRUE potential is known (full evaluation). */
export function isScouted(draft: DraftState, prospectId: string): boolean {
  return scoutLevel(draft, prospectId) === 3;
}

/** True potential if fully evaluated, otherwise null. */
export function revealedPotential(draft: DraftState, player: BasketballPlayer): number | null {
  return isScouted(draft, player.id) ? player.development.potential : null;
}

/** Materialize the tiered fields on a (possibly legacy) draft. */
function normalized(draft: DraftState): DraftState {
  if (typeof draft.scoutPoints === 'number' && draft.scoutLevels) return draft;
  const levels: Record<string, ScoutLevel> = { ...(draft.scoutLevels ?? {}) };
  for (const id of draft.scoutedIds ?? []) if (!levels[id]) levels[id] = 3;
  return { ...draft, scoutPoints: scoutPointsLeft(draft), scoutLevels: levels };
}

function withDraft(league: LeagueState, draft: DraftState): LeagueState {
  return { ...league, sportData: { ...(league.sportData as LeagueSportData), draft } };
}

/**
 * Scout a prospect up to `level` (default: full evaluation), paying the
 * difference from his current tier. A no-op if he's already there, he's not in
 * the pool, or the budget can't cover it — you can never overspend.
 */
export function scoutProspect(league: LeagueState, prospectId: string, level: Exclude<ScoutLevel, 0> = 3): LeagueState {
  const draft = getDraft(league);
  if (!draft) return league;
  if (!draft.poolIds.includes(prospectId as PlayerId)) return league;
  const cost = upgradeCost(draft, prospectId, level);
  if (cost === 0) return league;
  const points = scoutPointsLeft(draft);
  if (cost > points) return league;
  const base = normalized(draft);
  return withDraft(league, {
    ...base,
    scoutPoints: points - cost,
    scoutLevels: { ...base.scoutLevels, [prospectId]: level },
  });
}

/** Scout several prospects in order (stops spending when the budget runs out). */
export function scoutMany(league: LeagueState, prospectIds: string[], level: Exclude<ScoutLevel, 0>): LeagueState {
  let l = league;
  for (const id of prospectIds) l = scoutProspect(l, id, level);
  return l;
}

// ===========================================================================
// Watchlist
// ===========================================================================

export function isWatched(draft: DraftState, prospectId: string): boolean {
  return (draft.watchlist ?? []).includes(prospectId as PlayerId);
}

export function toggleWatchlist(league: LeagueState, prospectId: string): LeagueState {
  const draft = getDraft(league);
  if (!draft) return league;
  const list = draft.watchlist ?? [];
  const watchlist = list.includes(prospectId as PlayerId)
    ? list.filter(id => id !== prospectId)
    : [...list, prospectId as PlayerId];
  return withDraft(league, { ...draft, watchlist });
}

// ===========================================================================
// Perception + reports
// ===========================================================================

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

/**
 * Potential range shown at a tier. One per-prospect offset `u` positions the
 * truth inside every window, and the window shrinks with each tier, so ranges
 * are nested (narrow monotonically) and ALWAYS contain the true potential; L3
 * collapses to it exactly.
 */
export function potentialRange(player: BasketballPlayer, level: ScoutLevel, saveSeed: string, season: number): { low: number; high: number } {
  const pot = player.development.potential;
  const h = RANGE_HALF_WIDTH[level];
  const u = makeRng(`range-${saveSeed}-${player.id}-${season}`).random();
  return {
    low: clamp(pot - Math.round(2 * h * u), 40, 99),
    high: clamp(pot + Math.round(2 * h * (1 - u)), 40, 99),
  };
}

export interface SkillGrade { label: string; grade: string; value: number }

function letter(v: number): string {
  return v >= 90 ? 'A+' : v >= 85 ? 'A' : v >= 80 ? 'A-'
    : v >= 75 ? 'B+' : v >= 70 ? 'B' : v >= 65 ? 'B-'
    : v >= 60 ? 'C+' : v >= 55 ? 'C' : v >= 50 ? 'C-' : 'D';
}

/** Position-relevant skill bands with tier-scaled noise (the scout's eye). */
export function skillBands(player: BasketballPlayer, level: ScoutLevel, saveSeed: string): SkillGrade[] {
  const r = player.ratings;
  const bands: [string, number][] = [
    ['Shooting', (r.threePoint * 2 + r.midRange + r.freeThrow) / 4],
    ['Finishing', (r.finishing * 2 + r.postScoring) / 3],
    ['Playmaking', (r.handles + r.passing) / 2],
    ['Defense', player.sportData.position === 'C' || player.sportData.position === 'PF'
      ? (r.interiorDefense * 2 + r.block + r.rebounding) / 4
      : (r.perimeterDefense * 2 + r.steal + r.interiorDefense) / 4],
    ['Athleticism', (r.speed + r.vertical + r.strength) / 3],
  ];
  const noise = SKILL_NOISE[level];
  // Same unit draw per band at every tier → L2 noise is a shrunken L1 noise.
  const rng = makeRng(`skills-${saveSeed}-${player.id}`);
  return bands.map(([label, v]) => {
    const seen = clamp(Math.round(v + (rng.random() * 2 - 1) * noise), 25, 99);
    return { label, grade: letter(seen), value: seen };
  });
}

export interface CombineLine { label: string; value: string }

function ftIn(inches: number): string {
  const whole = Math.round(inches * 4) / 4;
  const ft = Math.floor(whole / 12);
  const inch = whole - ft * 12;
  return `${ft}'${inch % 1 === 0 ? inch : inch.toFixed(2).replace(/0$/, '')}"`;
}

/** Combine/workout measurables — derived deterministically from ratings (no noise: they're measured). */
export function combineMeasurables(player: BasketballPlayer): CombineLine[] {
  const r = player.ratings;
  const reach = r.height * 1.33 + (r.wingspan - r.height) * 0.5;
  const noStep = 22 + (r.vertical / 100) * 12;
  const maxVert = noStep + 4 + (r.speed / 100) * 4;
  const lane = 12.4 - ((r.speed * 0.6 + r.handles * 0.15 + r.perimeterDefense * 0.25) / 100) * 2.3;
  const sprint = 3.65 - (r.speed / 100) * 0.55;
  return [
    { label: 'Height', value: ftIn(r.height) },
    { label: 'Wingspan', value: ftIn(r.wingspan) },
    { label: 'Standing reach', value: ftIn(reach) },
    { label: 'No-step vert', value: `${noStep.toFixed(1)}"` },
    { label: 'Max vert', value: `${maxVert.toFixed(1)}"` },
    { label: 'Lane agility', value: `${lane.toFixed(2)}s` },
    { label: '¾ sprint', value: `${sprint.toFixed(2)}s` },
  ];
}

export type ScoutVerdict = 'Gem' | 'As advertised' | 'Bust risk';

/**
 * Full-evaluation verdict: true ceiling vs. the public projection, plus the
 * prospect's hidden boom/bust development trait — the same per-save seed
 * (`${league.id}-${id}`) advanceSeason feeds developBasketballPlayer, so a
 * "Gem" really does tend to hit in this save.
 */
export function scoutVerdict(player: BasketballPlayer, saveSeed: string, season: number): ScoutVerdict {
  const gap = player.development.potential - perceivedPotential(player, season);
  const dev = developmentFactorFor(`${saveSeed}-${player.id}`);
  const boom = dev >= 1.25;
  const bust = dev <= 0.7;
  if (boom || (gap >= 5 && !bust)) return 'Gem';
  if (bust || gap <= -5) return 'Bust risk';
  return 'As advertised';
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
