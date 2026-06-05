/**
 * League-wide per-game stat ranks (parity item 1.1).
 *
 * Football annotates every stat line with its league ordinal ("21.5 · 4th").
 * This computes the same for basketball, reusing the standard leaderboard
 * qualification (40% of the games-played leader, matching app/stats/page.tsx)
 * so a player's rank here matches where they sit on the /stats leaderboard.
 */

import { regularSeasonStatsByPlayer } from './seasonStats';
import type { BasketballStats, BasketballRatings } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export type StatCategory = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'stk';

const SELECTORS: Record<StatCategory, (s: BasketballStats) => number> = {
  ppg: s => s.points / s.gamesPlayed,
  rpg: s => s.totalRebounds / s.gamesPlayed,
  apg: s => s.assists / s.gamesPlayed,
  spg: s => s.steals / s.gamesPlayed,
  bpg: s => s.blocks / s.gamesPlayed,
  stk: s => (s.steals + s.blocks) / s.gamesPlayed,
};

export interface LeagueStatRanks {
  /** Number of qualified players (shared denominator across categories). */
  of: number;
  /** 1 = league leader; null if the player didn't qualify (too few games). */
  rank(playerId: string, cat: StatCategory): number | null;
}

/** Precompute per-category ranks for every qualified player in one pass. */
export function computeLeagueStatRanks(league: LeagueState): LeagueStatRanks {
  const stats = regularSeasonStatsByPlayer(league);

  let maxGp = 1;
  for (const s of stats.values()) maxGp = Math.max(maxGp, s.gamesPlayed);
  const gpMin = Math.max(1, Math.floor(maxGp * 0.4));

  const qualified: { pid: string; s: BasketballStats }[] = [];
  for (const [pid, s] of stats) {
    if (s.gamesPlayed >= gpMin) qualified.push({ pid: pid as string, s });
  }

  const rankMaps = {} as Record<StatCategory, Map<string, number>>;
  for (const cat of Object.keys(SELECTORS) as StatCategory[]) {
    const sel = SELECTORS[cat];
    const sorted = [...qualified].sort((a, b) => sel(b.s) - sel(a.s));
    const m = new Map<string, number>();
    sorted.forEach(({ pid }, i) => m.set(pid, i + 1));
    rankMaps[cat] = m;
  }

  return {
    of: qualified.length,
    rank: (playerId, cat) => rankMaps[cat].get(playerId) ?? null,
  };
}
