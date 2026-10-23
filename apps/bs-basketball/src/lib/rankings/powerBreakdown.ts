/**
 * Power-rankings depth breakdown (Football parity: position-group ranks).
 *
 * Pure. For every team, derives position-group strength from the HEALTHY
 * roster's ratings plus offense/defense from both ratings and real results:
 *
 *   Backcourt  — PG/SG by primary position, weighted top-3 OVR  [1, .8, .4]
 *   Wings      — SF, weighted top-2 OVR                          [1, .5]
 *   Frontcourt — PF/C, weighted top-3 OVR                        [1, .8, .4]
 *   Bench      — non-starters (resolved lineup), weighted top-5  [1, .9, .8, .6, .4]
 *     Missing depth slots are filled with a replacement-level 45, so a team
 *     with one guard is punished for it.
 *   Offense / Defense (ratings) — mean of offensive / defensive skill ratings
 *     over the starting five (weight 1) and top-3 bench (weight .5).
 *   ORtg / DRtg / Net — per 100 possessions from played games (lib/stats/advanced).
 *
 * Each metric is also ranked 1..N league-wide (1 = best; for DRtg, lowest).
 */

import type { BasketballPlayer, BasketballTeam, BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import { getInjuries, healthyPlayers } from '../injuries';
import { resolveLineup } from '../lineup';
import { regularSeasonStatsByTeam } from '../stats/teamSeasonStats';
import { teamRatings } from '../stats/advanced';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export const REPLACEMENT_OVR = 45;

export type GroupKey = 'backcourt' | 'wings' | 'frontcourt' | 'bench' | 'offense' | 'defense' | 'ortg' | 'drtg' | 'net';

export const GROUP_LABEL: Record<GroupKey, string> = {
  backcourt: 'Backcourt', wings: 'Wings', frontcourt: 'Frontcourt', bench: 'Bench',
  offense: 'Offense', defense: 'Defense', ortg: 'ORtg', drtg: 'DRtg', net: 'Net Rtg',
};

/** Lower is better for these keys. */
const LOWER_IS_BETTER: ReadonlySet<GroupKey> = new Set(['drtg']);

export interface TeamBreakdown {
  teamId: string;
  values: Record<GroupKey, number>;
  ranks: Record<GroupKey, number>;
  /** Best players in each positional group (for display). */
  leaders: { backcourt: string[]; wings: string[]; frontcourt: string[]; bench: string[] };
  gamesPlayed: number;
}

const OFF_KEYS: (keyof BasketballRatings)[] = ['threePoint', 'midRange', 'finishing', 'postScoring', 'handles', 'passing', 'basketballIQ'];
const DEF_KEYS: (keyof BasketballRatings)[] = ['perimeterDefense', 'interiorDefense', 'rebounding', 'steal', 'block'];

/** Weighted mean of the top-N OVRs, padding missing slots with replacement level. */
export function weightedDepth(ovrs: number[], weights: number[]): number {
  const sorted = [...ovrs].sort((a, b) => b - a);
  let sum = 0, wsum = 0;
  weights.forEach((w, i) => { sum += w * (sorted[i] ?? REPLACEMENT_OVR); wsum += w; });
  return wsum > 0 ? sum / wsum : 0;
}

function meanOf(p: BasketballPlayer, keys: (keyof BasketballRatings)[]): number {
  return keys.reduce((s, k) => s + (p.ratings[k] as number), 0) / keys.length;
}

function names(ps: BasketballPlayer[], n: number): string[] {
  return [...ps].sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, n).map(p => `${p.firstName[0]}. ${p.lastName}`);
}

function rawBreakdown(league: LeagueState, team: BasketballTeam, gp: number, rt: ReturnType<typeof teamRatings> | null) {
  const players = league.players as Record<string, BasketballPlayer>;
  const roster = team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
  const healthy = healthyPlayers(roster, getInjuries(league), league.currentTick);
  const pool = healthy.length >= 5 ? healthy : roster;

  const bc = pool.filter(p => p.sportData.position === 'PG' || p.sportData.position === 'SG');
  const wg = pool.filter(p => p.sportData.position === 'SF');
  const fc = pool.filter(p => p.sportData.position === 'PF' || p.sportData.position === 'C');

  let starters: BasketballPlayer[] = [];
  let bench: BasketballPlayer[] = [];
  if (pool.length >= 5) {
    const lu = resolveLineup(team, pool);
    const starterIds = new Set<string>(lu.starters);
    starters = pool.filter(p => starterIds.has(p.id));
    bench = pool.filter(p => !starterIds.has(p.id));
  } else {
    starters = pool;
  }
  const topBench = [...bench].sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 3);

  const weighted = (keys: (keyof BasketballRatings)[]) => {
    let s = 0, w = 0;
    for (const p of starters) { s += meanOf(p, keys); w += 1; }
    for (const p of topBench) { s += 0.5 * meanOf(p, keys); w += 0.5; }
    return w > 0 ? s / w : 0;
  };

  const values: Record<GroupKey, number> = {
    backcourt: weightedDepth(bc.map(p => p.ratings.overall), [1, 0.8, 0.4]),
    wings: weightedDepth(wg.map(p => p.ratings.overall), [1, 0.5]),
    frontcourt: weightedDepth(fc.map(p => p.ratings.overall), [1, 0.8, 0.4]),
    bench: weightedDepth(bench.map(p => p.ratings.overall), [1, 0.9, 0.8, 0.6, 0.4]),
    offense: weighted(OFF_KEYS),
    defense: weighted(DEF_KEYS),
    ortg: rt && gp > 0 ? rt.ortg : 0,
    drtg: rt && gp > 0 ? rt.drtg : 0,
    net: rt && gp > 0 ? rt.net : 0,
  };
  return {
    teamId: team.id,
    values,
    leaders: { backcourt: names(bc, 2), wings: names(wg, 2), frontcourt: names(fc, 2), bench: names(bench, 2) },
    gamesPlayed: gp,
  };
}

/** Per-team breakdown with league-wide ranks for every group. */
export function powerBreakdown(league: LeagueState): Map<string, TeamBreakdown> {
  const teamStats = regularSeasonStatsByTeam(league);
  const raws = (league.teams as BasketballTeam[]).map(t => {
    const agg = teamStats.get(t.id);
    const rt = agg ? teamRatings(agg.off, agg.def, agg.gp) : null;
    return rawBreakdown(league, t, agg?.gp ?? 0, rt);
  });

  const keys = Object.keys(GROUP_LABEL) as GroupKey[];
  const ranks = new Map<string, Record<GroupKey, number>>(raws.map(r => [r.teamId, {} as Record<GroupKey, number>]));
  for (const k of keys) {
    const dir = LOWER_IS_BETTER.has(k) ? 1 : -1;
    const order = [...raws].sort((a, b) => dir * (a.values[k] - b.values[k]) || a.teamId.localeCompare(b.teamId));
    order.forEach((r, i) => { ranks.get(r.teamId)![k] = i + 1; });
  }

  const out = new Map<string, TeamBreakdown>();
  for (const r of raws) out.set(r.teamId, { ...r, ranks: ranks.get(r.teamId)! });
  return out;
}

/** League table for one group, best first. */
export function rankByGroup(breakdown: Map<string, TeamBreakdown>, key: GroupKey): TeamBreakdown[] {
  return [...breakdown.values()].sort((a, b) => a.ranks[key] - b.ranks[key]);
}
