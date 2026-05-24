/**
 * Shared test fixtures and helpers for integration tests.
 *
 * Goal: let each test file be self-contained and readable while reusing the
 * boilerplate of constructing a viable league for the engine to operate on.
 */

import type { Team, Player, GameResult, TeamRecord } from '@/types';

/** Minimal 32-team fixture suitable for schedule generation + sim. Mirrors
 *  the structure of an imported FBGM league file but uses minimal placeholder
 *  data. Use this when a test just needs "valid-shaped teams" rather than
 *  real roster data.
 *
 *  Each team gets a varied prior-finish record so schedule.ts's NFL-style
 *  pairing logic (which pairs "remaining in-conference teams based on prior
 *  finish position") has actual variance to work with. Without this, every
 *  team is 0-0 and the NFL path falls through to the fallback scheduler. */
export function makeFixtureTeams(count = 32): Team[] {
  const conferences: ('AC' | 'NC')[] = ['AC', 'NC'];
  const divisions: ('North' | 'South' | 'East' | 'West')[] = ['North', 'South', 'East', 'West'];

  return Array.from({ length: count }, (_, i) => {
    const conference = conferences[Math.floor(i / 16)];
    const division = divisions[Math.floor((i % 16) / 4)];
    // Spread wins 4-13 across teams within each division so finish positions
    // are unambiguous within division (NFL scheduler ranks 1st/2nd/3rd/4th
    // per division based on these).
    const intraDivisionIdx = i % 4; // 0,1,2,3 within division
    const wins = 13 - intraDivisionIdx * 3; // 13, 10, 7, 4
    return {
      id: `team-${i}`,
      city: `City${i}`,
      name: `Name${i}`,
      abbreviation: `T${i.toString().padStart(2, '0')}`,
      conference,
      division,
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      record: { ...emptyTeamRecord(), wins, losses: 17 - wins },
      salaryCap: 200_000_000,
      totalPayroll: 0,
      roster: [],
      draftPicks: [],
      depthChart: {
        QB: [], RB: [], WR: [], TE: [], OL: [],
        DL: [], LB: [], CB: [], S: [],
        K: [], P: [],
      },
      deadCap: [],
      franchiseTagUsed: false,
      revenue: { tickets: 0, merchandise: 0, tvDeal: 0, total: 0 },
    } satisfies Team;
  });
}

export function emptyTeamRecord(): TeamRecord {
  return {
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    streak: 0,
    divisionWins: 0,
    divisionLosses: 0,
    homeWins: 0,
    homeLosses: 0,
    awayWins: 0,
    awayLosses: 0,
    conferenceWins: 0,
    conferenceLosses: 0,
  };
}

/** Sanity counter — when a schedule looks weird, this helps localize where. */
export function countGamesPerTeam(games: GameResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const g of games) {
    counts[g.homeTeamId] = (counts[g.homeTeamId] ?? 0) + 1;
    counts[g.awayTeamId] = (counts[g.awayTeamId] ?? 0) + 1;
  }
  return counts;
}

/** Group games by week. Helpful for asserting bye weeks land in the right range. */
export function gamesByWeek(games: GameResult[]): Record<number, GameResult[]> {
  const byWeek: Record<number, GameResult[]> = {};
  for (const g of games) {
    (byWeek[g.week] ??= []).push(g);
  }
  return byWeek;
}

// Silence the unused-import warning for Player — kept in the imports list
// because future fixtures (roster builders, etc.) will need it.
export type { Player };
