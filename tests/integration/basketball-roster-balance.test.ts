/**
 * Roster-balance regression tests (Sim-Day blocker fix).
 *
 * The blocker: OVR-only waivers shed every center over a few offseasons, a team
 * reached 0 players at a position, the lineup builder emitted an empty-string
 * starter, and the sim crashed dereferencing it. Three layers guard against it
 * now; one test each:
 *   1. Position-aware waivers (Fix 1) — every team keeps ≥1 of each position
 *      across repeated rollovers.
 *   2. Cross-position lineup fallback (Fix 2) — buildDefaultBasketballLineup
 *      never emits an empty starter when the roster has ≥5 players.
 *   3. The sim survives a roster with a missing position end-to-end.
 */

import { describe, it, expect } from 'vitest';
import {
  buildDefaultBasketballLineup,
  generateBasketballPlayer,
  type BasketballPlayer,
  type BasketballPosition,
} from '@bs/sport-basketball';
import { simBasketballGame, type BasketballGameSide } from '@bs/sport-basketball/sim';
import type { PlayerId, TeamId } from '@bs/core/adapter';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

function posCounts(playerIds: readonly PlayerId[], players: Record<string, BasketballPlayer>): Record<BasketballPosition, number> {
  const c: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const id of playerIds) {
    const p = players[id];
    if (p?.sportData?.position) c[p.sportData.position]++;
  }
  return c;
}

function playRegSeason<T extends ReturnType<typeof createNewBasketballLeague>>(l: T): T {
  let g = 0;
  while (!isRegularSeasonComplete(l) && g < 400) {
    const r = simNextDay(l);
    if (!r) break;
    l = r.league as T;
    g++;
  }
  return l;
}

function playPlayoffs<T extends ReturnType<typeof createNewBasketballLeague>>(l: T): T {
  let cur = initializePlayoffs(l) as T;
  let g = 0;
  while (!getBracket(cur)!.complete && g < 200) {
    const r = simPlayoffDay(cur);
    if (!r) break;
    cur = r.league as T;
    g++;
  }
  return cur;
}

describe('roster balance — sim-day blocker', () => {
  it('keeps ≥1 player at every position across repeated rollovers', () => {
    let league = createNewBasketballLeague({ rngSeed: 'roster-balance' });
    const ROLLOVERS = 4;
    for (let s = 0; s < ROLLOVERS; s++) {
      league = advanceToNextSeason(playPlayoffs(playRegSeason(league)));
      const players = league.players as Record<string, BasketballPlayer>;
      for (const team of league.teams) {
        const counts = posCounts(team.playerIds, players);
        for (const pos of POSITIONS) {
          expect(counts[pos], `season ${league.currentSeason}: ${team.abbreviation} has ${counts[pos]} ${pos}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  }, 120_000);

  it('builds a 5-man lineup with no empty starters when a position is missing', () => {
    // Roster of only guards/wings — zero centers.
    const roster: BasketballPlayer[] = [
      ...Array.from({ length: 4 }, () => generateBasketballPlayer({ position: 'PG', targetOverall: 70 })),
      ...Array.from({ length: 4 }, () => generateBasketballPlayer({ position: 'SG', targetOverall: 70 })),
      ...Array.from({ length: 4 }, () => generateBasketballPlayer({ position: 'SF', targetOverall: 70 })),
    ];
    const lineup = buildDefaultBasketballLineup(roster);
    expect(lineup.starters).toHaveLength(5);
    expect(lineup.starters.every(id => !!id)).toBe(true); // no '' sentinel
    expect(new Set(lineup.starters).size).toBe(5); // all distinct
    const rosterIds = new Set(roster.map(p => p.id));
    expect(lineup.starters.every(id => rosterIds.has(id))).toBe(true); // all real
  });

  it('sims a game without throwing when one side has zero centers', () => {
    const makeSide = (prefix: string, positions: BasketballPosition[]): BasketballGameSide => {
      const players = positions.map(pos => generateBasketballPlayer({ position: pos, targetOverall: 70 }));
      return {
        teamId: `${prefix}-team` as TeamId,
        players,
        lineup: buildDefaultBasketballLineup(players),
      };
    };
    // Home has NO centers (4 PG, 4 SG, 4 SF, 0 PF... keep a PF so only C is missing).
    const home = makeSide('home', ['PG', 'PG', 'PG', 'SG', 'SG', 'SG', 'SF', 'SF', 'SF', 'PF', 'PF', 'PF']);
    const away = makeSide('away', ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C', 'C']);

    expect(() =>
      simBasketballGame(home, away, {
        gameId: 'g-balance' as never,
        season: 2030,
        date: '2030-01-01',
        competitionId: 'primary' as never,
        isPlayoff: false,
        rngSeed: 'balance-seed',
      }),
    ).not.toThrow();
  });
});
