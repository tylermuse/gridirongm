/**
 * Tiered scouting report — exactly what the user's scouting level has unlocked
 * on one prospect, plus what the next tier costs. Pure + deterministic per save.
 */

import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { DraftState, ScoutLevel } from '../draft/types';
import {
  SCOUT_TIERS, combineMeasurables, perceivedPotential, potentialRange, projectionGrade,
  scoutLevel, scoutPointsLeft, scoutVerdict, skillBands, upgradeCost,
  type CombineLine, type ProjectionGrade, type ScoutTier, type ScoutVerdict, type SkillGrade,
} from './scouting';
import { archetypeFor, buildScoutingReport, nbaComparisonFor } from './scoutingReport';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface TierUpgrade extends ScoutTier {
  /** Points to reach this tier from the current one. */
  costFromHere: number;
  affordable: boolean;
}

export interface TieredScoutReport {
  level: ScoutLevel;
  levelName: string;
  /** Public projection (pre-scouting). */
  projected: number;
  projectedGrade: ProjectionGrade;
  /** Potential range at this tier — always contains the truth; exact at L3. */
  range: { low: number; high: number };
  /** L1+ */
  skills: SkillGrade[] | null;
  /** L2+ */
  combine: CombineLine[] | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  /** L3 */
  truePotential: number | null;
  verdict: ScoutVerdict | null;
  archetype: string | null;
  comparison: string | null;
  /** Higher tiers still available, with their marginal cost. */
  upgrades: TierUpgrade[];
  pointsLeft: number;
}

/** Per-save seed (league.id is a fresh uuid per save — same pattern as development). */
export function scoutSaveSeed(league: { id?: string }): string {
  return league.id ?? 'save';
}

export function buildTieredReport(league: LeagueState, draft: DraftState, player: BasketballPlayer): TieredScoutReport {
  const save = scoutSaveSeed(league);
  const level = scoutLevel(draft, player.id);
  const projected = perceivedPotential(player, draft.season);
  const pointsLeft = scoutPointsLeft(draft);
  const legacy = level >= 2 ? buildScoutingReport(player, { season: draft.season, scouted: level === 3 }) : null;
  const pot = player.development.potential;
  const archetype = level === 3 ? archetypeFor(player) : null;

  return {
    level,
    levelName: level === 0 ? 'Unscouted' : SCOUT_TIERS[level - 1].name,
    projected,
    projectedGrade: projectionGrade(projected),
    range: potentialRange(player, level, save, draft.season),
    skills: level >= 1 ? skillBands(player, level, save) : null,
    combine: level >= 2 ? combineMeasurables(player) : null,
    strengths: legacy ? legacy.strengths : null,
    weaknesses: legacy ? legacy.weaknesses : null,
    truePotential: level === 3 ? pot : null,
    verdict: level === 3 ? scoutVerdict(player, save, draft.season) : null,
    archetype,
    comparison: archetype ? nbaComparisonFor(archetype, pot, hash(player.id) >> 3) : null,
    upgrades: SCOUT_TIERS.filter(t => t.level > level).map(t => {
      const costFromHere = upgradeCost(draft, player.id, t.level);
      return { ...t, costFromHere, affordable: costFromHere <= pointsLeft };
    }),
    pointsLeft,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
